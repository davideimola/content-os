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
  EngagementOutcome,
  EngagementTalk,
  EventRecord,
  Piece,
  PieceState,
  PieceWithBlocker,
  Talk,
  TalkState,
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

// The same grouping one level up: months, each holding its days (#117). The Calendar
// reads as a quarter, so the month is the heading and the day is the row; the
// incoming order is preserved, which is what lets the past be grouped the same way
// by handing this the reversed list.
export type MonthGroup = { month: string; days: [string, Row[]][] };

export function groupRowsByMonth(rows: Row[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const [date, group] of groupRowsByDate(rows)) {
    const month = date.slice(0, 7);
    const last = groups.at(-1);
    if (last?.month === month) last.days.push([date, group]);
    else groups.push({ month, days: [[date, group]] });
  }
  return groups;
}

// ── the by-date projection ────────────────────────────────────────────────────
// Everything that carries a date, as one sorted agenda: a Piece's publish date, a
// CFP's deadline, an Event's start. The Calendar's spine (ADR-0001 keeps the records
// the source of truth; the date is what this view adds).
//
// **Pure, over reads the view already has.** The Calendar needs the Pieces and the
// whole Engagement tier anyway — to hand each row its drawer — so deriving the agenda
// from those two instead of reading `pieces`/`engagements`/`events` a second time is
// three queries saved (#111 left this fold-in to #117). `getCalendarItems()` is this
// same function over its own reads, so the projection has exactly one definition.
//
// A declined Piece that still carries a date stays on the agenda: the date is a fact
// of the record, and a row that reads `declined` is the honest way to show it.
const KIND_RANK: Record<CalendarItem["kind"], number> = { piece: 0, cfp: 1, event: 2 };

export function calendarItems(
  pieces: Array<Pick<Piece, "id" | "title" | "channel" | "state" | "publish_date">>,
  ctx: EngagementContext
): CalendarItem[] {
  const items: CalendarItem[] = [];

  for (const p of pieces) {
    if (!p.publish_date) continue;
    items.push({
      id: p.id,
      date: p.publish_date,
      kind: "piece",
      title: p.title,
      detail: p.channel,
      state: p.state,
    });
  }

  // Only a `cfp` with a deadline is a dated fact — which is why the three live
  // submissions are absent from this view, and why the Calendar states their count
  // instead of leaving the absence to be noticed (`cfpsWithoutDeadline`).
  for (const e of Object.values(ctx.engagements)) {
    if (e.kind !== "cfp" || !e.deadline) continue;
    items.push({
      id: e.id,
      date: e.deadline,
      kind: "cfp",
      title: ctx.talkByEngagement[e.id]?.talkTitle ?? "CFP",
      detail: ctx.events[e.event_id]?.name ?? null,
      state: e.outcome,
    });
  }

  for (const ev of Object.values(ctx.events)) {
    if (!ev.starts_on) continue;
    items.push({
      id: ev.id,
      date: ev.starts_on,
      kind: "event",
      title: ev.name,
      detail: ev.location,
      state: eventTalkReadiness(ctx, ev.id),
    });
  }

  // Date first, then the day's output before the context around it (a Piece, then a
  // deadline, then a conference), then the id: a fully determined order, so the
  // agenda cannot reshuffle between two reads of the same data.
  items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      a.id.localeCompare(b.id)
  );
  return items;
}

// ── an Event's state ──────────────────────────────────────────────────────────
// An Event's state is the readiness of the Talk being taken to it — the answer to
// "there is a conference in three weeks; is anything written?" (#117). Where several
// Talks share one Event the **least ready wins**, because that is the work left.
//
// Only a Talk actually being given counts: `accepted` (a CFP that got in) or
// `confirmed` (a direct invitation). A submission still `to_submit`/`submitted` is not
// yet work owed, and a `rejected` one never will be.
//
// `declined` sits last in the order on purpose: a Talk pulled from an Event is not
// work left, so it never wins over a live one — but when it is the only one, the Event
// says so rather than falling silent. A total order over the closed enum, so the
// compiler catches a new Talk state instead of it silently sorting first.
const TALK_WORK_LEFT: Record<TalkState, number> = {
  proposed: 0,
  in_production: 1,
  ready: 2,
  declined: 3,
};

export function eventTalkReadiness(ctx: EngagementContext, eventId: string): TalkState | null {
  const speaking = (ctx.talksByEvent[eventId] ?? []).filter(
    (t) => t.outcome === "accepted" || t.outcome === "confirmed"
  );
  if (speaking.length === 0) return null;
  return speaking.reduce<TalkState>(
    (least, t) => (TALK_WORK_LEFT[t.talkState] < TALK_WORK_LEFT[least] ? t.talkState : least),
    speaking[0].talkState
  );
}

// ── reading an item's state back ───────────────────────────────────────────────
// `CalendarItem.state` carries three different vocabularies in one string field —
// a Piece's lifecycle state, a CFP's outcome, a Talk's readiness — because a by-date
// item is not one kind of thing. A row renders the state **from the item**, so the
// projection above is the only place any of it is decided; these narrow the string
// back to the enum its kind's badge needs, and answer `null` rather than casting
// blindly, so an unrecognised value falls back to being shown verbatim.
const PIECE_STATES: PieceState[] = ["proposed", "slotted", "ready", "published", "declined"];
const OUTCOMES: EngagementOutcome[] = [
  "to_submit",
  "submitted",
  "accepted",
  "rejected",
  "confirmed",
];

const oneOf = <T extends string>(all: T[], value: string | null): T | null =>
  value != null && (all as string[]).includes(value) ? (value as T) : null;

export const asPieceState = (v: string | null) => oneOf(PIECE_STATES, v);
export const asTalkState = (v: string | null) =>
  oneOf(Object.keys(TALK_WORK_LEFT) as TalkState[], v);
export const asEngagementOutcome = (v: string | null) => oneOf(OUTCOMES, v);

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

// How many of a Talk's engagements are NOT submissions, i.e. `direct` invitations
// (#119). The Talks view is the asset sheet for what a Talk was *submitted* to, and an
// invitation is a different act: it is born `confirmed`, has nothing to await and no
// answer to write. Nothing in the contract creates one — the console's
// `createEngagement` passes `kind = 'cfp'`, the MCP adapter has no Engagement tool at
// all, and no live row is `direct` — so a creation flow and a row design for the kind
// could not be driven at any seam, which is this repo's whole discipline. The
// deliberate call is therefore: **no surface, but no silence either.** The sheet states
// the number it is not showing, so a Talk carrying an invitation says so instead of
// reading as never taken anywhere. The day something does create one, that line is
// where the surface gets added.
export function invitationsOfTalk(ctx: EngagementContext, talkId: string): number {
  return (ctx.engagementsByTalk[talkId] ?? []).filter((e) => e.kind !== "cfp").length;
}

// The submissions the Calendar cannot show: a `cfp` with no deadline is not a dated
// fact, so it never enters the agenda (#117). All three live submissions are in this
// list — which is exactly why the count is stated with its cause, rather than leaving
// Davide to wonder where a submission he remembers making went.
export function cfpsWithoutDeadline(ctx: EngagementContext): CfpSubmission[] {
  return Object.values(ctx.engagements)
    .filter((e) => e.kind === "cfp" && e.deadline == null)
    .map((e) => resolve(ctx, e));
}

// ── what is waiting for a date ────────────────────────────────────────────────
// The other half of the Calendar's lane: the outputs that exist but sit nowhere on it
// (#117). `proposed` is the one state that means "not placed" — a Piece leaves it by
// being slotted, a Talk by going into production — so this is the Calendar's question
// (*when*), where the home's "To judge" asks *whether* about the same set.
//
// A Piece is required to be undated as well as `proposed`: the state ladder makes that
// redundant today (`slot_piece` is what sets a date), and it should stay a fact of the
// record rather than an assumption about the verbs.
export type Proposal = { kind: "piece"; piece: PieceWithBlocker } | { kind: "talk"; talk: Talk };

export const proposalKey = (p: Proposal): string =>
  p.kind === "piece" ? `piece-${p.piece.id}` : `talk-${p.talk.id}`;

export function undatedProposals(pieces: PieceWithBlocker[], talks: Talk[]): Proposal[] {
  return [
    ...pieces
      .filter((p) => p.state === "proposed" && p.publish_date == null)
      .map<Proposal>((piece) => ({ kind: "piece", piece })),
    ...talks
      .filter((t) => t.state === "proposed")
      .map<Proposal>((talk) => ({ kind: "talk", talk })),
  ];
}
