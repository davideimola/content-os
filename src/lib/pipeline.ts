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

// A Piece with its blocker resolved to a title. `blocked_by_piece_id` on its own is
// an opaque id, and a cue reading "blocked by 7629" tells nobody anything (#111), so
// every read of the Pieces table resolves the blocker's title against the same rows.
// Derived at read time — never a column.
export type PieceWithBlocker = Piece & { blockedByTitle: string | null };

// A theme: a hand-assigned subject lens over Ideas, data (not an enum) so it can
// be minted/retired without a migration (#78). `archived` retires it reversibly —
// kept on record, excluded from the live picker.
export type Theme = {
  id: string;
  label: string;
  archived: boolean;
  created_at: string;
};

// A theme as carried by an Idea — id + label + whether it is archived (an Idea can
// still be tagged with a since-archived theme; the label resolves either way).
export type ThemeRef = { id: string; label: string; archived: boolean };

// An Idea enriched with its output provenance — a read-back of piece_sources
// (#76): how many Pieces it spawned and which. Ideas stay a live pool (ADR-0014);
// this is *visible* provenance, not a new lifecycle state. Talk provenance is out
// of scope, so usedCount counts Pieces only. `themes` is the Idea's hand-assigned
// subject tags (#78), resolved to labels via the idea_themes join.
export type IdeaWithProvenance = Idea & {
  usedCount: number;
  spawnedPieces: SpawnedPiece[];
  themes: ThemeRef[];
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
  new_followers: number | null;
};

// The follower LEVEL, keyed by the date it was observed (#113). It is not a
// quantity of a period, so it never sits on a month row: the export reports the
// total at export time, which is always after the month it came with has ended.
export type FollowerLevel = {
  observed_on: string; // YYYY-MM-DD — the date the number is true for
  total: number;
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

// Resolve each Piece's `blocked_by_piece_id` to the blocking Piece's title (#111).
// A blocker is always another Piece, so the whole-table read resolves itself; an
// unresolvable id keeps a null title and the cue falls back to the id.
function withBlockerTitles(pieces: Piece[]): PieceWithBlocker[] {
  const titleById = new Map(pieces.map((p) => [p.id, p.title]));
  return pieces.map((p) => ({
    ...p,
    blockedByTitle: p.blocked_by_piece_id ? (titleById.get(p.blocked_by_piece_id) ?? null) : null,
  }));
}

export async function getPieces(): Promise<PieceWithBlocker[]> {
  return withBlockerTitles(await selectAll<Piece>("pieces", "*", { column: "created_at" }));
}

export function getLiveIdeas(): Promise<Idea[]> {
  return selectAll<Idea>("ideas", "*", { column: "created_at", ascending: false }).then((ideas) =>
    ideas.filter((i) => i.status === "live")
  );
}

// Every theme (live + archived), by label — the drawer filters `archived` out for
// the picker but keeps them to resolve an Idea's since-archived tags (#78).
export function getThemes(): Promise<Theme[]> {
  return selectAll<Theme>("themes", "id,label,archived,created_at", { column: "label" });
}

// Fold a `<owner>_themes` join onto its owners. One fold for both joins — idea_themes
// and piece_themes are the same shape and must resolve the same way: theme ids resolve
// against the WHOLE vocabulary (archived included, so a since-retired tag still reads
// as itself), and each owner's list is sorted by label, because the join rows arrive
// in no meaningful order and unsorted chips reshuffle between reads.
function foldThemeRefs(
  rows: Array<{ ownerId: string; themeId: string }>,
  vocabulary: Theme[]
): Record<string, ThemeRef[]> {
  const themeById = new Map(vocabulary.map((t) => [t.id, t]));
  const byOwner: Record<string, ThemeRef[]> = {};
  for (const { ownerId, themeId } of rows) {
    const t = themeById.get(themeId);
    if (!t) continue; // defensive: the FK + cascade keep this from happening
    byOwner[ownerId] = [
      ...(byOwner[ownerId] ?? []),
      { id: t.id, label: t.label, archived: t.archived },
    ];
  }
  for (const refs of Object.values(byOwner)) refs.sort((a, b) => a.label.localeCompare(b.label));
  return byOwner;
}

// The theme lookup a drawer is handed (#112): the vocabulary to pick from, each
// Piece's assigned Themes with their labels resolved, and which Themes are carried
// by anything at all. **Plain records and arrays, never Maps or Sets** — this
// crosses from a Server Component into a Client one and a Map does not survive the
// RSC payload (#111).
//
// A Theme is a property of the content, so it is carried by the output and not only
// by the spark: `byPiece` is the per-Piece set that coverage-by-Theme folds, counted
// over Pieces — the same metre as Cadence and the Flag mix. Labels resolve against
// the WHOLE vocabulary, archived included, so a Theme retired after it was assigned
// still reads as itself.
export type ThemeContext = {
  vocabulary: Theme[]; // every theme, label-sorted (live + archived)
  byPiece: Record<string, ThemeRef[]>; // a Piece's assigned themes
  inUse: string[]; // theme ids carried by any Idea or any Piece
};

// `inUse` spans BOTH joins: a Theme carried only by a Piece is still in use, and must
// not be offered for retirement (the tagger's "retire unused" row, #78). Pure and
// shared, so the Ideas pool's read below cannot arrive at a different answer than the
// drawers' — a Theme that may not be retired must not be retirable on one page.
function themeIdsInUse(
  ideaRows: Array<{ theme_id: string }>,
  pieceRows: Array<{ theme_id: string }>
): string[] {
  return [...new Set([...ideaRows, ...pieceRows].map((r) => r.theme_id))];
}

export async function getThemeContext(): Promise<ThemeContext> {
  const db = supabaseAdmin();
  const [vocabulary, pieceThemes, ideaThemes] = await Promise.all([
    getThemes(),
    db.from("piece_themes").select("piece_id,theme_id"),
    db.from("idea_themes").select("idea_id,theme_id"),
  ]);
  if (pieceThemes.error) throw new Error(`read piece_themes failed: ${pieceThemes.error.message}`);
  if (ideaThemes.error) throw new Error(`read idea_themes failed: ${ideaThemes.error.message}`);

  const pieceRows = (pieceThemes.data ?? []) as Array<{ piece_id: string; theme_id: string }>;
  const ideaRows = (ideaThemes.data ?? []) as Array<{ theme_id: string }>;

  const byPiece = foldThemeRefs(
    pieceRows.map((r) => ({ ownerId: r.piece_id, themeId: r.theme_id })),
    vocabulary
  );

  return { vocabulary, byPiece, inUse: themeIdsInUse(ideaRows, pieceRows) };
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
// spawned-Pieces provenance (#76): usedCount = the number of linked Pieces,
// spawnedPieces = the list (for the drawer's clickable provenance). An Idea that
// spawned nothing reports 0 / an empty list. Archived Ideas are returned too (status
// carried through) so the triage list's archived toggle can filter client-side (#77);
// the default view shows live.
//
// The reads and the fold are separate, and both are shared by the two public reads
// below — `getIdeasWithProvenance` and `getIdeaPool` — so the pool can never mean two
// things depending on which door it came through, and the extra read `getIdeaPool`
// needs is the ONLY difference between them.
type PoolRows = {
  ideas: Idea[];
  pieces: Piece[];
  sourceRows: Array<{ idea_id: string; piece_id: string }>;
  ideaThemeRows: Array<{ idea_id: string; theme_id: string }>;
  vocabulary: Theme[];
};

async function readPoolRows(): Promise<PoolRows> {
  const db = supabaseAdmin();
  const [ideas, pieces, sources, vocabulary, ideaThemes] = await Promise.all([
    selectAll<Idea>("ideas", "*", { column: "created_at", ascending: false }),
    getPieces(),
    db.from("piece_sources").select("idea_id,piece_id"),
    getThemes(),
    db.from("idea_themes").select("idea_id,theme_id"),
  ]);
  if (sources.error) throw new Error(`read piece_sources failed: ${sources.error.message}`);
  if (ideaThemes.error) throw new Error(`read idea_themes failed: ${ideaThemes.error.message}`);
  return {
    ideas,
    pieces,
    vocabulary,
    sourceRows: (sources.data ?? []) as Array<{ idea_id: string; piece_id: string }>,
    ideaThemeRows: (ideaThemes.data ?? []) as Array<{ idea_id: string; theme_id: string }>,
  };
}

function withProvenance({
  ideas,
  pieces,
  sourceRows,
  ideaThemeRows,
  vocabulary,
}: PoolRows): IdeaWithProvenance[] {
  const pieceById = new Map(pieces.map((p) => [p.id, p]));
  const byIdea = new Map<string, SpawnedPiece[]>();
  for (const { idea_id, piece_id } of sourceRows) {
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

  // Fold the idea_themes join onto the Ideas — the same fold the Piece side uses, so
  // an Idea's tags and a Piece's resolve identically (labels, archived, order).
  const themesByIdea = foldThemeRefs(
    ideaThemeRows.map((r) => ({ ownerId: r.idea_id, themeId: r.theme_id })),
    vocabulary
  );

  return ideas.map((idea) => {
    const spawnedPieces = (byIdea.get(idea.id) ?? []).sort(bySpawnOrder);
    return {
      ...idea,
      usedCount: spawnedPieces.length,
      spawnedPieces,
      themes: themesByIdea[idea.id] ?? [],
    };
  });
}

export async function getIdeasWithProvenance(): Promise<IdeaWithProvenance[]> {
  return withProvenance(await readPoolRows());
}

// ── the Ideas view's one read (#118) ────────────────────────────────────────────
// The pool with its provenance AND the two Theme facts the view's cards, filter and
// grouping need — every table read **once**. Before this, `/ideas` called
// `getIdeasWithProvenance()` and `getThemeContext()` side by side and so asked
// `themes` and `idea_themes` twice per request while throwing away `byPiece`, which
// nothing on that page renders (flagged by #112 and again by #120).
//
// It is `getIdeasWithProvenance` plus **one** read, `piece_themes`, for one reason:
// `inUse` spans both joins, so a Theme carried only by a Piece is in use and must not
// be offered for retirement in the tagger — the same answer `getThemeContext` gives,
// from the same helper. It deliberately does NOT return `byPiece`: that is the fact
// `/metrics` needs and this page does not, and the whole point here was to stop
// deriving it for a view that never renders it.
export type IdeaPool = {
  ideas: IdeaWithProvenance[];
  /** Every Theme, label-sorted, archived included (a retired tag still reads as itself). */
  vocabulary: Theme[];
  /** Theme ids carried by any Idea or any Piece — the ones that may NOT be retired. */
  inUse: string[];
};

export async function getIdeaPool(): Promise<IdeaPool> {
  const [rows, pieceThemes] = await Promise.all([
    readPoolRows(),
    supabaseAdmin().from("piece_themes").select("theme_id"),
  ]);
  if (pieceThemes.error) throw new Error(`read piece_themes failed: ${pieceThemes.error.message}`);

  return {
    ideas: withProvenance(rows),
    vocabulary: rows.vocabulary,
    inUse: themeIdsInUse(
      rows.ideaThemeRows,
      (pieceThemes.data ?? []) as Array<{ theme_id: string }>
    ),
  };
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

// More months than the record will hold for years — the "every month" argument, named
// so two callers cannot drift apart on the literal.
const EVERY_MONTH = 120;

// The most recent months with an account snapshot (newest first) — [latest, previous]
// gives the Overview its value + month-over-month delta.
export async function getLinkedinAccounts(limit = 2): Promise<LinkedinAccount[]> {
  const { data, error } = await supabaseAdmin()
    .from("metrics_linkedin_account")
    .select("month,impressions,members_reached,new_followers")
    .order("month", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`read metrics_linkedin_account failed: ${error.message}`);
  return (data ?? []) as LinkedinAccount[];
}

// The most recent follower observation, or null while none is on record. One row,
// carrying its own date — the tile shows the level AND when it was true, because
// a level without its date is the thing #113 removed.
export async function getLatestFollowerLevel(): Promise<FollowerLevel | null> {
  const { data, error } = await supabaseAdmin()
    .from("metrics_linkedin_followers")
    .select("observed_on,total")
    .order("observed_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`read metrics_linkedin_followers failed: ${error.message}`);
  return (data as FollowerLevel | null) ?? null;
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

// Per-Piece metrics as a plain record keyed by piece id — the lookup a card or a row
// is handed (plain records cross the RSC boundary; a Map does not). A LinkedIn Piece
// gets its linked post summed across months; a blog Piece gets its publish month's
// site-wide visitors, since there is no per-post site figure (ADR-0019).
export async function getPieceMetricsById(pieces: Piece[]): Promise<Record<string, PieceMetrics>> {
  const [posts, site] = await Promise.all([getLinkedinPosts(), getSiteMetrics()]);
  return pieceMetricsFrom(pieces, posts, site);
}

// The same fold, pure, over rows the caller already holds — so a view that needs the
// per-post rows for its own panels (the Metrics page) does not read the table twice
// to also get this lookup (#120).
export function pieceMetricsFrom(
  pieces: Piece[],
  posts: LinkedinPost[],
  site: SiteMetric[]
): Record<string, PieceMetrics> {
  const byUrl = sumByPostUrl(posts);
  const siteByMonth = new Map<string, number | null>(
    site.map((s) => [s.month.slice(0, 7), s.visitors])
  );
  const byPiece: Record<string, PieceMetrics> = {};
  for (const p of pieces) {
    if (p.channel === "linkedin") {
      byPiece[p.id] = {
        linkedin: p.linkedin_post_url ? (byUrl.get(p.linkedin_post_url) ?? null) : null,
      };
    } else if (p.channel === "blog" && p.publish_date) {
      byPiece[p.id] = { siteVisitors: siteByMonth.get(p.publish_date.slice(0, 7)) ?? null };
    }
  }
  return byPiece;
}

// ── Monthly trend: LinkedIn + site, merged per month for the /metrics view ─────
export type MonthlyMetrics = {
  month: string; // YYYY-MM-01
  li_impressions: number | null;
  li_reach: number | null;
  /**
   * Summed from the month's per-post rows — **null when the month has none**, like
   * every other field here. It used to default to `0`, which made a month that was
   * never ingested read as *zero engagements*: a fabricated fact, and a trend chart
   * drawing a fall to zero that never happened (#120). Absence of an ingest and a
   * month that genuinely engaged nobody are different things, so only the presence
   * of per-post rows makes this a number.
   */
  li_engagements: number | null;
  li_new_followers: number | null; // the month's growth — a quantity OF the month
  site_visitors: number | null;
  site_page_views: number | null;
};

// One row per month that has any data (newest first). Merges the LinkedIn account
// snapshot, the site numbers, and per-month engagements (summed from post rows) —
// keyed by YYYY-MM so first-of-month dates from any source line up.
export async function getMonthlyMetrics(): Promise<MonthlyMetrics[]> {
  const [accounts, site, posts] = await Promise.all([
    getLinkedinAccounts(EVERY_MONTH),
    getSiteMetrics(),
    getLinkedinPosts(),
  ]);
  return monthlyMetricsFrom(accounts, site, posts);
}

// The merge itself, pure — so the Metrics page can build these rows from the three
// reads it already needs for its other panels (#120).
export function monthlyMetricsFrom(
  accounts: LinkedinAccount[],
  site: SiteMetric[],
  posts: LinkedinPost[]
): MonthlyMetrics[] {
  const key = (m: string) => m.slice(0, 7);
  const acc = new Map(accounts.map((a) => [key(a.month), a]));
  const sit = new Map(site.map((s) => [key(s.month), s]));
  // Keyed on the months that HAVE per-post rows, so "no rows" stays distinguishable
  // from "rows summing to zero" — the first is null, the second is 0.
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
      li_engagements: eng.get(m) ?? null,
      li_new_followers: a?.new_followers ?? null,
      site_visitors: s?.visitors ?? null,
      site_page_views: s?.page_views ?? null,
    };
  });
  rows.sort((x, y) => y.month.localeCompare(x.month)); // newest first
  return rows;
}

// The follower curve: CUMULATIVE GROWTH from the first month with data, not a
// level series (#113). Each step is that month's exact `new_followers` — verified
// window-independent — so the slope is true even though the baseline is unknown;
// the absolute level is the Followers tile's job, with its observation date. One
// month of data is one honest point, and the same curve becomes a real series the
// moment the follower backfill lands.
//
// Months with no growth figure are skipped rather than read as zero: a month that
// was never ingested is unknown, and drawing it flat would invent a fact.
export function cumulativeFollowerGrowth(
  rows: MonthlyMetrics[]
): Array<{ month: string; value: number }> {
  let running = 0;
  return [...rows]
    .reverse() // rows arrive newest-first; a curve runs oldest -> newest
    .filter((r) => r.li_new_followers != null)
    .map((r) => {
      running += r.li_new_followers as number;
      return { month: r.month, value: running };
    });
}

// ── The metrics page's one read (#120) ──────────────────────────────────────────
// The Metrics view needs the same three metrics tables for four different panels —
// the month rows, the per-post list, the per-Piece cross, and which months have been
// ingested at all. Reading them once and deriving the four is what keeps the view
// from asking `metrics_linkedin_posts` three times per render, which is exactly the
// cost #116 flagged when it worked around the fabricated zero on the home.
export type MetricsContext = {
  monthly: MonthlyMetrics[]; // newest first
  posts: LinkedinPost[]; // every measured per-post row, impressions desc
  followerLevel: FollowerLevel | null;
  byPiece: Record<string, PieceMetrics>;
  /**
   * The YYYY-MM keys that have per-post rows — the one definition of *ingested* the
   * view uses to explain an empty per-Piece cell. A month can carry an account
   * snapshot and no per-post rows, so this is not "months with LinkedIn data".
   */
  ingestedMonths: string[];
};

export async function getMetricsContext(pieces: Piece[]): Promise<MetricsContext> {
  const [accounts, site, posts, followerLevel] = await Promise.all([
    getLinkedinAccounts(EVERY_MONTH),
    getSiteMetrics(),
    getLinkedinPosts(),
    getLatestFollowerLevel(),
  ]);
  return {
    monthly: monthlyMetricsFrom(accounts, site, posts),
    posts,
    followerLevel,
    byPiece: pieceMetricsFrom(pieces, posts, site),
    ingestedMonths: [...new Set(posts.map((p) => p.month.slice(0, 7)))].sort(),
  };
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
  // A Piece's lifecycle state, a CFP's submission outcome, or — for an Event — the
  // readiness of the Talk being taken to it, least ready first where several share it
  // (`eventTalkReadiness`, #117). Null only when nothing is accepted there yet.
  state: string | null;
};

// The projection that fills these is **pure** and lives in `src/lib/rows.ts`
// (`calendarItems`), over `getPieces()` and `getEngagementContext()` — the two reads a
// by-date view needs anyway to hand each row its drawer. There is deliberately no
// `getCalendarItems()` read beside them: it would fetch `pieces`, `engagements` and
// `events` a second time for facts its caller is already holding (#111 left that
// fold-in to #117).

// ── Engagement tier: Talk → its CFPs → their Event ──────────────────────────────
// The tier has existed since init and no view ever read it whole: the Calendar's
// by-date read only picks up CFPs that carry a deadline, and every live Engagement
// has `deadline: null`. These types mirror the enums in the init migration
// (`engagement_kind`, `engagement_outcome`) — the outcome vocabulary is constrained
// by kind server-side (`engagement_outcome_matches_kind`).
export type EngagementKind = "cfp" | "direct";
export type EngagementOutcome = "to_submit" | "submitted" | "accepted" | "rejected" | "confirmed";

// Named `EventRecord`, not `Event`, so it never shadows the DOM's `Event`. Only what
// a drawer shows is read — `is_public` and the timestamps stay in the table.
export type EventRecord = {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  location: string | null;
  url: string | null;
  roles: string[];
};

export type Engagement = {
  id: string;
  talk_id: string;
  event_id: string;
  kind: EngagementKind;
  outcome: EngagementOutcome;
  deadline: string | null;
  cfp_link: string | null;
};

// A Talk taken to an Event through one Engagement: the submission's own outcome
// alongside the Talk's readiness. One Talk → many Engagements, so the same Talk
// state shows under every Event it was taken to — one fact, one meaning.
export type EngagementTalk = {
  engagementId: string;
  talkId: string;
  talkTitle: string;
  talkState: TalkState;
  outcome: EngagementOutcome;
  deadline: string | null;
};

// The lookup a row needs to open an Event or CFP drawer, keyed by the id the row
// carries. **Plain records, never Maps**: this crosses from a Server Component into
// a Client one and a Map does not survive the RSC payload (#111).
export type EngagementContext = {
  events: Record<string, EventRecord>;
  engagements: Record<string, Engagement>;
  talksByEvent: Record<string, EngagementTalk[]>; // every Talk taken to an Event
  talkByEngagement: Record<string, EngagementTalk>; // the Talk one submission is of
  engagementsByTalk: Record<string, Engagement[]>; // a Talk's submissions
};

export async function getEngagementContext(): Promise<EngagementContext> {
  const db = supabaseAdmin();
  const [talks, engagements, events] = await Promise.all([
    getTalks(),
    db
      .from("engagements")
      .select("id,talk_id,event_id,kind,outcome,deadline,cfp_link")
      .order("created_at"),
    db.from("events").select("id,name,starts_on,ends_on,location,url,roles").order("name"),
  ]);
  if (engagements.error) throw new Error(`read engagements failed: ${engagements.error.message}`);
  if (events.error) throw new Error(`read events failed: ${events.error.message}`);

  const talkById = new Map(talks.map((t) => [t.id, t]));
  const ctx: EngagementContext = {
    events: Object.fromEntries(((events.data ?? []) as EventRecord[]).map((e) => [e.id, e])),
    engagements: {},
    talksByEvent: {},
    talkByEngagement: {},
    engagementsByTalk: {},
  };

  for (const e of (engagements.data ?? []) as Engagement[]) {
    ctx.engagements[e.id] = e;
    ctx.engagementsByTalk[e.talk_id] = [...(ctx.engagementsByTalk[e.talk_id] ?? []), e];
    const talk = talkById.get(e.talk_id);
    if (!talk) continue; // defensive: the FK keeps an Engagement's Talk alive
    const attached: EngagementTalk = {
      engagementId: e.id,
      talkId: talk.id,
      talkTitle: talk.title,
      talkState: talk.state,
      outcome: e.outcome,
      deadline: e.deadline,
    };
    ctx.talkByEngagement[e.id] = attached;
    ctx.talksByEvent[e.event_id] = [...(ctx.talksByEvent[e.event_id] ?? []), attached];
  }

  return ctx;
}
