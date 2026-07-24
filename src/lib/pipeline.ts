import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";

// Domain types mirror the Supabase enums (see supabase/migrations/*_init.sql).
// Kept hand-written for now; if this grows, generate them with `supabase gen types`.
export type FlagSide = "flag" | "side";
export type PieceChannel = "blog" | "linkedin";
export type PieceState = "proposed" | "slotted" | "ready" | "published" | "declined";
export type TalkState = "proposed" | "in_production" | "ready" | "declined";
export type IdeaStatus = "live" | "archived";

export type Piece = {
  id: string;
  title: string;
  channel: PieceChannel;
  flag_side: FlagSide;
  state: PieceState;
  publish_date: string | null;
  blocked_by_piece_id: string | null;
  artifact_url: string | null;
  linkedin_post_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Idea = {
  id: string;
  body: string;
  title: string | null;
  status: IdeaStatus;
  source: string | null;
  created_at: string;
  updated_at: string;
};

export type Talk = {
  id: string;
  title: string;
  flag_side: FlagSide;
  state: TalkState;
  brief_url: string | null;
  created_at: string;
  updated_at: string;
};

// A Piece an Idea spawned (via the piece_sources join) — the drawer's clickable
// provenance entry. A subset of Piece: enough to show + link to it (#76).
export type SpawnedPiece = {
  id: string;
  title: string;
  channel: PieceChannel;
  state: PieceState;
  publish_date: string | null;
};

// An Idea enriched with its output provenance — a read-back of piece_sources
// (#76): how many Pieces it spawned and which. Ideas stay a live pool (ADR-0014);
// this is *visible* provenance, not a new lifecycle state. Talk provenance is out
// of scope, so usedCount counts Pieces only.
export type IdeaWithProvenance = Idea & {
  usedCount: number;
  spawnedPieces: SpawnedPiece[];
};

export type Cadence = {
  linkedin_week_covered: boolean;
  blog_month_covered: boolean;
};

export type FlagMix = { flag: number; side: number; total: number };

// ── Metrics (ADR-0019) ──────────────────────────────────────────────────────
// LinkedIn figures are per-period: a still-active post has one row per month, so
// a Piece's total is the SUM over its rows, joined by post_url (pieces.linkedin_post_url).
export type LinkedinAccount = {
  month: string; // YYYY-MM-01
  impressions: number | null;
  members_reached: number | null;
  followers_total: number | null;
  new_followers: number | null;
};
export type LinkedinPost = {
  month: string;
  posted_on: string | null;
  post_url: string;
  impressions: number | null;
  engagements: number | null;
};
export type SiteMetric = { month: string; visitors: number | null; page_views: number | null };

// The per-Piece cross: impressions/engagements summed across every monthly slice
// of the linked post, plus how many months it has been measured.
export type PieceMetrics = {
  linkedin?: { impressions: number; engagements: number; months: number } | null;
  siteVisitors?: number | null; // for a blog Piece: its publish-month site visitors (site-wide)
};

// The live order of the Pipeline lifecycle — used to group Pieces on the board.
export const PIECE_STATE_ORDER: PieceState[] = ["proposed", "slotted", "ready", "published"];

async function selectAll<T>(
  table: string,
  columns: string,
  order: { column: string; ascending?: boolean }
): Promise<T[]> {
  const { data, error } = await supabaseAdmin()
    .from(table)
    .select(columns)
    .order(order.column, { ascending: order.ascending ?? true });
  if (error) throw new Error(`read ${table} failed: ${error.message}`);
  return (data ?? []) as T[];
}

export function getPieces(): Promise<Piece[]> {
  return selectAll<Piece>("pieces", "*", { column: "created_at" });
}

export function getLiveIdeas(): Promise<Idea[]> {
  return selectAll<Idea>("ideas", "*", { column: "created_at", ascending: false }).then((ideas) =>
    ideas.filter((i) => i.status === "live")
  );
}

// Dated Pieces first (oldest→newest), then undated; id as a stable tie-break. Keeps
// the drawer's provenance list deterministic regardless of piece_sources row order.
function bySpawnOrder(a: SpawnedPiece, b: SpawnedPiece): number {
  if (a.publish_date && b.publish_date) return a.publish_date.localeCompare(b.publish_date);
  if (a.publish_date) return -1;
  if (b.publish_date) return 1;
  return a.id.localeCompare(b.id);
}

// The whole Idea pool (live + archived, newest first), each Idea enriched with its
// spawned-Pieces provenance (#76). Reads the piece_sources join and folds it onto
// the Ideas: usedCount = the number of linked Pieces, spawnedPieces = the list (for
// the drawer's clickable provenance). An Idea that spawned nothing reports 0 / an
// empty list. Archived Ideas are returned too (status carried through) so the triage
// list's archived toggle can filter client-side (#77); the default view shows live.
export async function getIdeasWithProvenance(): Promise<IdeaWithProvenance[]> {
  const [ideas, pieces, sources] = await Promise.all([
    selectAll<Idea>("ideas", "*", { column: "created_at", ascending: false }),
    getPieces(),
    supabaseAdmin().from("piece_sources").select("idea_id,piece_id"),
  ]);
  if (sources.error) throw new Error(`read piece_sources failed: ${sources.error.message}`);

  const pieceById = new Map(pieces.map((p) => [p.id, p]));
  const byIdea = new Map<string, SpawnedPiece[]>();
  for (const { idea_id, piece_id } of (sources.data ?? []) as Array<{
    idea_id: string;
    piece_id: string;
  }>) {
    const p = pieceById.get(piece_id);
    if (!p) continue; // a source row can outlive its Piece only via cascade, so this is defensive
    const list = byIdea.get(idea_id) ?? [];
    list.push({
      id: p.id,
      title: p.title,
      channel: p.channel,
      state: p.state,
      publish_date: p.publish_date,
    });
    byIdea.set(idea_id, list);
  }

  return ideas.map((idea) => {
    const spawnedPieces = (byIdea.get(idea.id) ?? []).sort(bySpawnOrder);
    return { ...idea, usedCount: spawnedPieces.length, spawnedPieces };
  });
}

export function getTalks(): Promise<Talk[]> {
  return selectAll<Talk>("talks", "*", { column: "created_at" });
}

export async function getCadence(): Promise<Cadence> {
  const { data, error } = await supabaseAdmin().from("cadence_status").select("*").single();
  if (error) throw new Error(`read cadence_status failed: ${error.message}`);
  return data as Cadence;
}

export async function getFlagMix(): Promise<FlagMix> {
  const { data, error } = await supabaseAdmin().from("flag_mix").select("*").single();
  if (error) throw new Error(`read flag_mix failed: ${error.message}`);
  return data as FlagMix;
}

// The most recent months with an account snapshot (newest first) — [latest, previous]
// gives the Overview its value + month-over-month delta.
export async function getLinkedinAccounts(limit = 2): Promise<LinkedinAccount[]> {
  const { data, error } = await supabaseAdmin()
    .from("metrics_linkedin_account")
    .select("month,impressions,members_reached,followers_total,new_followers")
    .order("month", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`read metrics_linkedin_account failed: ${error.message}`);
  return (data ?? []) as LinkedinAccount[];
}

export function getLinkedinPosts(): Promise<LinkedinPost[]> {
  return selectAll<LinkedinPost>(
    "metrics_linkedin_posts",
    "month,posted_on,post_url,impressions,engagements",
    { column: "impressions", ascending: false }
  );
}

export function getSiteMetrics(): Promise<SiteMetric[]> {
  return selectAll<SiteMetric>("metrics_site", "month,visitors,page_views", { column: "month" });
}

// Sum a post's monthly slices into one per-Piece total, keyed by post_url.
export function sumByPostUrl(
  posts: LinkedinPost[]
): Map<string, { impressions: number; engagements: number; months: number }> {
  const m = new Map<string, { impressions: number; engagements: number; months: number }>();
  for (const p of posts) {
    const cur = m.get(p.post_url) ?? { impressions: 0, engagements: 0, months: 0 };
    cur.impressions += p.impressions ?? 0;
    cur.engagements += p.engagements ?? 0;
    cur.months += 1;
    m.set(p.post_url, cur);
  }
  return m;
}

// Sum a single month's per-post engagements (the account snapshot has no total).
export function monthEngagements(posts: LinkedinPost[], month: string): number {
  return posts.filter((p) => p.month === month).reduce((sum, p) => sum + (p.engagements ?? 0), 0);
}

// ── Monthly trend: LinkedIn + site, merged per month for the /metrics view ─────
export type MonthlyMetrics = {
  month: string; // YYYY-MM-01
  li_impressions: number | null;
  li_reach: number | null;
  li_engagements: number; // summed from the month's per-post rows
  li_followers: number | null;
  li_new_followers: number | null;
  site_visitors: number | null;
  site_page_views: number | null;
};

// One row per month that has any data (newest first). Merges the LinkedIn account
// snapshot, the site numbers, and per-month engagements (summed from post rows) —
// keyed by YYYY-MM so first-of-month dates from any source line up.
export async function getMonthlyMetrics(): Promise<MonthlyMetrics[]> {
  const [accounts, site, posts] = await Promise.all([
    getLinkedinAccounts(120),
    getSiteMetrics(),
    getLinkedinPosts(),
  ]);
  const key = (m: string) => m.slice(0, 7);
  const acc = new Map(accounts.map((a) => [key(a.month), a]));
  const sit = new Map(site.map((s) => [key(s.month), s]));
  const eng = new Map<string, number>();
  for (const p of posts) eng.set(key(p.month), (eng.get(key(p.month)) ?? 0) + (p.engagements ?? 0));

  const months = new Set<string>([...acc.keys(), ...sit.keys(), ...eng.keys()]);
  const rows: MonthlyMetrics[] = [...months].map((m) => {
    const a = acc.get(m);
    const s = sit.get(m);
    return {
      month: `${m}-01`,
      li_impressions: a?.impressions ?? null,
      li_reach: a?.members_reached ?? null,
      li_engagements: eng.get(m) ?? 0,
      li_followers: a?.followers_total ?? null,
      li_new_followers: a?.new_followers ?? null,
      site_visitors: s?.visitors ?? null,
      site_page_views: s?.page_views ?? null,
    };
  });
  rows.sort((x, y) => y.month.localeCompare(x.month)); // newest first
  return rows;
}

// ── Calendar: the by-date projection over the Pipeline ──────────────────────────
// Unifies everything that has a date — Piece publish dates, CFP deadlines, and
// Event dates — into one sorted agenda. Mirrors the domain's Calendar (CONTEXT.md).
export type CalendarItemKind = "piece" | "cfp" | "event";
export type CalendarItem = {
  id: string;
  date: string; // YYYY-MM-DD
  kind: CalendarItemKind;
  title: string;
  detail: string | null; // channel / event name / location
  state: string | null; // piece state or engagement outcome
};

export async function getCalendarItems(): Promise<CalendarItem[]> {
  const db = supabaseAdmin();
  const [pieces, engagements, events] = await Promise.all([
    db.from("pieces").select("id,title,channel,state,publish_date").not("publish_date", "is", null),
    db
      .from("engagements")
      .select("id,outcome,deadline,talks(title),events(name)")
      .eq("kind", "cfp")
      .not("deadline", "is", null),
    db.from("events").select("id,name,starts_on,location").not("starts_on", "is", null),
  ]);
  if (pieces.error) throw new Error(`read pieces (calendar) failed: ${pieces.error.message}`);
  if (engagements.error) throw new Error(`read engagements failed: ${engagements.error.message}`);
  if (events.error) throw new Error(`read events failed: ${events.error.message}`);

  const one = <T>(v: T | T[] | null): T | null =>
    (Array.isArray(v) ? (v[0] ?? null) : v) as T | null;

  const items: CalendarItem[] = [];
  for (const p of (pieces.data ?? []) as Piece[]) {
    if (p.publish_date)
      items.push({
        id: p.id,
        date: p.publish_date,
        kind: "piece",
        title: p.title,
        detail: p.channel,
        state: p.state,
      });
  }
  for (const e of (engagements.data ?? []) as Array<{
    id: string;
    outcome: string;
    deadline: string;
    talks: { title: string } | { title: string }[] | null;
    events: { name: string } | { name: string }[] | null;
  }>) {
    items.push({
      id: e.id,
      date: e.deadline,
      kind: "cfp",
      title: one(e.talks)?.title ?? "CFP",
      detail: one(e.events)?.name ?? null,
      state: e.outcome,
    });
  }
  for (const ev of (events.data ?? []) as Array<{
    id: string;
    name: string;
    starts_on: string;
    location: string | null;
  }>) {
    items.push({
      id: ev.id,
      date: ev.starts_on,
      kind: "event",
      title: ev.name,
      detail: ev.location,
      state: null,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}
