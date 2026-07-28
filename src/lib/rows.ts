// The agenda's row model — what sits on a date, ready to be rendered as a row that
// opens that thing's drawer (#111) — plus the selectors a row needs to hand its
// drawer the record behind the date.
//
// **Pure and directive-free on purpose.** A Server Component may not call a function
// that lives in a client module, and the row *component* must be a client module (it
// hands a drawer a callback, which cannot cross the RSC boundary). So this layer lives
// here, where both sides can call it. The type imports below are erased at compile
// time, which is why importing them from the `server-only` read module is safe.

import type {
  CalendarItem,
  Engagement,
  EngagementContext,
  EngagementTalk,
  EventRecord,
  PieceWithBlocker,
} from "@/lib/pipeline";

// One thing on one date. A piece row carries the whole Piece, because its drawer
// offers every action the card's drawer does and needs the full record; a CFP or
// Event row carries only the by-date fact and finds the rest in the plain-record
// `EngagementContext` its component is handed.
export type Row =
  | { kind: "piece"; item: CalendarItem; piece: PieceWithBlocker | null }
  | { kind: "cfp"; item: CalendarItem }
  | { kind: "event"; item: CalendarItem };

// A stable React key: ids are unique per table, kinds are not.
export const rowKey = (row: Row): string => `${row.kind}-${row.item.id}`;

// Pair the by-date items with the Pieces behind them. Both reads come from the same
// table, so a piece row without its Piece cannot normally happen — it degrades to a
// row with no drawer rather than dropping the item out of the agenda.
export function buildRows(items: CalendarItem[], pieces: PieceWithBlocker[]): Row[] {
  const byId = new Map<string, PieceWithBlocker>(pieces.map((p) => [p.id, p]));
  return items.map((item) => {
    if (item.kind === "piece") return { kind: "piece", item, piece: byId.get(item.id) ?? null };
    return { kind: item.kind, item };
  });
}

// Group rows into [date, rows] pairs, preserving the incoming order (the reads sort
// by date, so the pairs come out in date order too).
export function groupRowsByDate(rows: Row[]): [string, Row[]][] {
  const byDate = new Map<string, Row[]>();
  for (const row of rows) {
    const list = byDate.get(row.item.date) ?? [];
    list.push(row);
    byDate.set(row.item.date, list);
  }
  return [...byDate.entries()];
}

// ── selectors over the Engagement tier ────────────────────────────────────────
// One CFP submission, whole: the Engagement, the conference it went to, and the
// Talk it is of. These three always travel together — into the CFP drawer, into a
// submission row — so they are one type, resolved once from the plain-record context.
export type CfpSubmission = {
  engagement: Engagement;
  event: EventRecord | null;
  talk: EngagementTalk | null;
};

const resolve = (ctx: EngagementContext, engagement: Engagement): CfpSubmission => ({
  engagement,
  event: ctx.events[engagement.event_id] ?? null,
  talk: ctx.talkByEngagement[engagement.id] ?? null,
});

// One submission by id — what a CFP-deadline row on the Calendar opens. Null when
// the id is not a `cfp` engagement, so a row falls back to opening nothing.
export function cfpSubmission(ctx: EngagementContext, engagementId: string): CfpSubmission | null {
  const engagement = ctx.engagements[engagementId];
  if (engagement?.kind !== "cfp") return null;
  return resolve(ctx, engagement);
}

// A Talk's submissions — the tier's one-to-many. `cfp` only, the same filter the
// Calendar's own read applies: a `direct` engagement is an invitation, not a
// submission, and no verb creates one yet.
export function cfpSubmissionsOfTalk(ctx: EngagementContext, talkId: string): CfpSubmission[] {
  return (ctx.engagementsByTalk[talkId] ?? [])
    .filter((e) => e.kind === "cfp")
    .map((e) => resolve(ctx, e));
}
