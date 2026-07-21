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

export type Cadence = {
  linkedin_week_covered: boolean;
  blog_month_covered: boolean;
};

export type FlagMix = { flag: number; side: number; total: number };

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
