// The facts the console is allowed to compute: arithmetic over dates, states and
// counts — never a judgement about the value of content (ADR-0021 dec.1). Nothing
// in here is persisted and nothing in here is a new state: every value is derived
// from `pieces` on each read, so it cannot drift from the record.
//
// **Pure and directive-free**, like `src/lib/rows.ts`: a Server Component builds
// these facts and a client row component displays them, so neither `"use client"`
// nor `server-only` may appear here. The type imports below are erased at compile
// time, which is why importing them from the `server-only` read module is safe.

import type { Piece, PieceState } from "@/lib/pipeline";
import type { Row } from "@/lib/rows";

// ── the four dials (#116) ─────────────────────────────────────────────────────
// First cuts to tune in use, **not contract**. They live here, in one object, so
// moving one is a one-line change with a visible blast radius. Each carries the
// reason its value is what it is, because a number without a reason gets "fixed"
// by the next person who dislikes it.
export const TUNING = {
  /**
   * How many agenda rows before the week reads as a wall. A live week holds two to
   * three Pieces; six leaves room for a dense one (two Pieces, a CFP deadline, an
   * Event) before the list stops being a glance. Overflow is stated, never silent.
   */
  agendaRows: 6,

  /**
   * The home's agenda window, in days: a **rolling** seven days, not the calendar
   * week. The home answers "what is coming at me", and a Sunday-evening glance at
   * an empty Mon–Sun week is the failure mode; a rolling window is always
   * populated. The **cadence** arithmetic below stays on calendar weeks, because
   * that is the phase the Thursday Beat's `covered` is defined on and the console
   * may not redefine it (ADR-0021 dec.5). That is the deliberate answer to the
   * spec's suspicion that this question needs two answers in two places: the
   * agenda is a rolling window, the floors are calendar periods.
   */
  agendaDays: 7,

  /**
   * Days before a slotted-but-unwritten Piece reads as **late**. Three: it is the
   * value that makes the case this rework exists for visible — on 28 Jul the home
   * showed two green pills while Friday's (31 Jul) LinkedIn Piece was unwritten —
   * and a LinkedIn post is an evening's work, so three days is the last honest
   * moment to notice. A blog needs more runway; if that proves to matter, this
   * splits per channel rather than growing for everything.
   */
  leadTimeDays: 3,

  /**
   * How many **weeks after the current one** to scan for a missing LinkedIn slot.
   * Measured in the prototype against this same data: a 4-week horizon shows no
   * holes, 8 shows one, 12 shows five, 20 shows thirteen running to December —
   * noise. Eight is the longest horizon that still reports only holes worth
   * filling (two today: 7–13 Sep and 21–27 Sep).
   */
  linkedinHoleWeeks: 8,

  /**
   * How many **months after the current one** to scan for a missing blog. The
   * monthly floor's unit is bigger, so a useful horizon is longer in absolute
   * time: six months surfaces December — the first uncovered month, and a blog
   * needs a month of runway — while keeping the list at two chips today.
   */
  blogHoleMonths: 6,

  /**
   * Display cap on the output-per-month chart. Not one of the four dials: a chart
   * of more than a year of columns is unreadable at any tuning.
   */
  outputMonths: 12,
} as const;

// ── dates ─────────────────────────────────────────────────────────────────────
// Local calendar dates, not UTC. Week and month boundaries are the whole point
// here, and `new Date().toISOString()` shifts them by the timezone offset. In
// production the server runs UTC (Vercel), which is also the timezone Postgres
// evaluates `current_date` in for `cadence_status` — so the console's "today" and
// the Beat's coincide there, and locally this is the human's calendar instead of
// one an hour or two behind it.
export function todayISO(): string {
  return toISO(new Date());
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISO(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// Whole days from `from` to `to`; negative when `to` is behind `from`. Rounded, so
// a DST hour inside the interval cannot bend a day into 0.96 of one.
export function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

// The Monday of the week a date falls in — the phase `cadence_status` is defined
// on (Postgres `date_trunc('week', …)` is Monday-based).
export function mondayOf(iso: string): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Mon = 0 … Sun = 6
  return toISO(d);
}

const monthKey = (iso: string) => iso.slice(0, 7);
const monthStart = (key: string) => `${key}-01`;
const monthEnd = (key: string) => {
  const d = parseISO(monthStart(key));
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
const addMonths = (key: string, n: number) => {
  const d = parseISO(monthStart(key));
  const m = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
};

const dayMonthFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric" });
const monthLongFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const monthTickFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });

// "7–13 Sep" inside one month, "28 Sep–4 Oct" across the boundary.
function weekLabel(start: string, end: string): string {
  const a = parseISO(start);
  const b = parseISO(end);
  return a.getMonth() === b.getMonth()
    ? `${dayFmt.format(a)}–${dayMonthFmt.format(b)}`
    : `${dayMonthFmt.format(a)}–${dayMonthFmt.format(b)}`;
}

// A month always carries its year: a gap list running into January is otherwise a
// riddle.
export const monthLabel = (key: string) => monthLongFmt.format(parseISO(monthStart(key)));
export const monthTick = (key: string) => monthTickFmt.format(parseISO(monthStart(key)));

// ── readiness: a slot exists vs the thing is written ──────────────────────────
// The blind spot the cadence pills hide. `covered` means a slot exists and must
// keep meaning exactly that (the Thursday Beat reads the same view); readiness is
// the *other* fact, derived here and stored nowhere:
//
//   published                        → shipped
//   date in the past, not published  → missed
//   ready                            → in the can
//   slotted                          → not written; late when days-until ≤ lead time
export type ReadinessKey = "shipped" | "missed" | "in_can" | "late" | "not_written" | "declined";

export type Readiness = {
  key: ReadinessKey;
  label: string;
  /** Days from today to the date; negative once it has passed. */
  daysUntil: number;
};

export const READINESS_LABEL: Record<ReadinessKey, string> = {
  shipped: "shipped",
  missed: "missed",
  in_can: "in the can",
  late: "late",
  not_written: "not written",
  declined: "declined",
};

const readiness = (key: ReadinessKey, daysUntil: number): Readiness => ({
  key,
  label: READINESS_LABEL[key],
  daysUntil,
});

// Readiness of one dated Piece. Null when it has no date: readiness is a fact
// about a commitment, and an undated proposal has made none.
export function readinessOf(
  piece: { state: PieceState; publish_date: string | null },
  today: string,
  leadDays: number = TUNING.leadTimeDays
): Readiness | null {
  if (!piece.publish_date) return null;
  const daysUntil = daysBetween(today, piece.publish_date);
  if (piece.state === "published") return readiness("shipped", daysUntil);
  if (piece.state === "declined") return readiness("declined", daysUntil);
  if (daysUntil < 0) return readiness("missed", daysUntil);
  if (piece.state === "ready") return readiness("in_can", daysUntil);
  if (daysUntil <= leadDays) return readiness("late", daysUntil);
  return readiness("not_written", daysUntil);
}

// How much of what is already dated is actually written — one figure, plus the
// buckets behind it. Mutually exclusive by construction: every dated Piece lands
// in exactly one readiness key.
export type WrittenVsDated = {
  dated: number;
  written: number; // shipped + in the can
  shipped: number;
  inCan: number;
  notWritten: number; // not written and not yet inside the lead-time window
  late: number;
  missed: number;
};

export function writtenVsDated(
  pieces: Array<Pick<Piece, "state" | "publish_date">>,
  today: string
): WrittenVsDated {
  const out: WrittenVsDated = {
    dated: 0,
    written: 0,
    shipped: 0,
    inCan: 0,
    notWritten: 0,
    late: 0,
    missed: 0,
  };
  for (const p of pieces) {
    // A declined Piece is not planned output, so it is not part of "what is dated".
    if (p.state === "declined") continue;
    const r = readinessOf(p, today);
    if (!r) continue;
    out.dated += 1;
    if (r.key === "shipped") out.shipped += 1;
    else if (r.key === "in_can") out.inCan += 1;
    else if (r.key === "late") out.late += 1;
    else if (r.key === "missed") out.missed += 1;
    else out.notWritten += 1;
  }
  out.written = out.shipped + out.inCan;
  return out;
}

// ── output per month: shipped vs merely planned ───────────────────────────────
// Two counts of dated Pieces, so this stays arithmetic. The window is the months
// the Pipeline actually covers — first dated month to last, gaps filled — never a
// padded run of zeros before the record starts, which would read as "you shipped
// nothing" about months nobody was tracking.
export type MonthOutput = { key: string; shipped: number; planned: number };

export function outputByMonth(
  pieces: Array<Pick<Piece, "state" | "publish_date">>,
  today: string
): MonthOutput[] {
  const dated = pieces.filter((p) => p.publish_date && p.state !== "declined");
  if (dated.length === 0) return [];

  const keys = dated.map((p) => monthKey(p.publish_date as string)).sort();
  let months: string[] = [];
  for (let k = keys[0]; k <= keys[keys.length - 1]; k = addMonths(k, 1)) months.push(k);

  if (months.length > TUNING.outputMonths) {
    // Keep the current month in view, with a little history before it.
    const here = months.indexOf(monthKey(today));
    const from = Math.min(Math.max(0, here - 2), months.length - TUNING.outputMonths);
    months = months.slice(from, from + TUNING.outputMonths);
  }

  return months.map((key) => {
    const inMonth = dated.filter((p) => monthKey(p.publish_date as string) === key);
    return {
      key,
      shipped: inMonth.filter((p) => p.state === "published").length,
      planned: inMonth.filter((p) => p.state !== "published").length,
    };
  });
}

// ── cadence holes: the floors read forward ────────────────────────────────────
// A hole is the Thursday Beat's own definition of `covered` projected forward, so
// the two can never disagree (ADR-0021 dec.5 — the Beat owns the predicate):
//
//   LinkedIn hole = a week  with no linkedin Piece in {slotted, ready, published}
//   blog hole     = a month with no blog     Piece in {slotted, ready, published}
//
// The **current** period is deliberately excluded from both lists: it is what the
// cadence pills answer, and two answers to one question on one page is how a view
// starts contradicting a Beat.
const HOLDS_A_SLOT: PieceState[] = ["slotted", "ready", "published"];

export type WeekHole = { key: string; start: string; end: string; label: string };
export type MonthHole = { key: string; label: string };

function holdsSlot(
  pieces: Array<Pick<Piece, "channel" | "state" | "publish_date">>,
  channel: Piece["channel"],
  from: string,
  to: string
): boolean {
  return pieces.some(
    (p) =>
      p.channel === channel &&
      p.publish_date != null &&
      HOLDS_A_SLOT.includes(p.state) &&
      p.publish_date >= from &&
      p.publish_date <= to
  );
}

export function linkedinHolesAhead(
  pieces: Array<Pick<Piece, "channel" | "state" | "publish_date">>,
  today: string,
  weeks: number = TUNING.linkedinHoleWeeks
): WeekHole[] {
  const holes: WeekHole[] = [];
  for (let i = 1; i <= weeks; i++) {
    const start = addDays(mondayOf(today), i * 7);
    const end = addDays(start, 6);
    if (!holdsSlot(pieces, "linkedin", start, end))
      holes.push({ key: start, start, end, label: weekLabel(start, end) });
  }
  return holes;
}

export function blogHolesAhead(
  pieces: Array<Pick<Piece, "channel" | "state" | "publish_date">>,
  today: string,
  months: number = TUNING.blogHoleMonths
): MonthHole[] {
  const holes: MonthHole[] = [];
  for (let i = 1; i <= months; i++) {
    const key = addMonths(monthKey(today), i);
    if (!holdsSlot(pieces, "blog", monthStart(key), monthEnd(key)))
      holes.push({ key, label: monthLabel(key) });
  }
  return holes;
}

// ── the home's agenda window ──────────────────────────────────────────────────
// A rolling seven days (see `TUNING.agendaDays`), plus every Piece that already
// reads `missed`: a date that passed with nothing shipped must not sit silently in
// the past just because the window moved beyond it. Rows arrive date-sorted and
// stay that way.
export function agendaWindowRows(rows: Row[], today: string): Row[] {
  const end = addDays(today, TUNING.agendaDays - 1);
  return rows.filter((row) => {
    if (row.item.date > end) return false;
    if (row.item.date >= today) return true;
    return (
      row.kind === "piece" && row.piece != null && readinessOf(row.piece, today)?.key === "missed"
    );
  });
}

// Cap a list and say what was dropped — a silent truncation reads as "that is all".
export function capped<T>(items: T[], max: number): { shown: T[]; hidden: number } {
  if (max <= 0 || items.length <= max) return { shown: items, hidden: 0 };
  return { shown: items.slice(0, max), hidden: items.length - max };
}
