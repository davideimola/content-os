// The facts the console is allowed to compute: arithmetic over dates, states and
// counts — never a judgement about the value of content (ADR-0021 dec.1). Nothing
// in here is persisted and nothing in here is a new state: every value is derived
// from `pieces` on each read, so it cannot drift from the record.
//
// **Pure and directive-free**, like `src/lib/rows.ts`: a Server Component builds
// these facts and a client row component displays them, so neither `"use client"`
// nor `server-only` may appear here. The type imports below are erased at compile
// time, which is why importing them from the `server-only` read module is safe.

import type { IdeaStatus, Piece, PieceState, ThemeRef } from "@/lib/pipeline";
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
   * Measured in the prototype against this same data, anchored on the current week:
   * a 4-week horizon showed no holes, 8 showed one, 12 showed five, 20 showed
   * thirteen running to December — noise. This list starts at the week *after* the
   * current one (that one is the pills' answer), so the same 8 reports two today —
   * 7–13 Sep and 21–27 Sep, both holes worth filling — where 12 would report five.
   */
  linkedinHoleWeeks: 8,

  /**
   * The same scan on the **Calendar**, where the horizon is longer. Not a second
   * definition of `covered` — it is the same predicate over more weeks, so a week
   * that is a hole is a hole on both surfaces and the two can never contradict each
   * other. The reason they differ is the occasion: the home is a glance at a ping
   * and wants the next thing, while the Calendar is where a date gets *placed* and
   * reads as a quarter (user story 14), so its lane has to cover the span being
   * placed into. Twelve is a first cut like the four above, not contract: the
   * prototype measured that horizon as the longest that still read like a list
   * (twelve reported five holes against that day's data, twenty reported thirteen
   * running to December — noise). Over today's data the same twelve reports six
   * weeks, 7–13 Sept through 19–25 Oct.
   */
  calendarHoleWeeks: 12,

  /**
   * How many **months after the current one** to scan for a missing blog. The
   * monthly floor's unit is bigger, so a useful horizon is longer in absolute
   * time: six months surfaces December — the first uncovered month, and a blog
   * needs a month of runway — while keeping the list at two chips today. Six
   * months already spans `calendarHoleWeeks`, so the Calendar needs no separate
   * blog horizon: both floors are read at least to the end of the quarter.
   */
  blogHoleMonths: 6,

  /**
   * Display cap on the output-per-month chart. Not one of the four dials: a chart
   * of more than a year of columns is unreadable at any tuning.
   */
  outputMonths: 12,

  /**
   * Display cap on a list in the Calendar's lane. Not one of the four dials either:
   * the lane sits ABOVE the agenda on a phone, so its length is what stands between
   * Davide and the thing he opened the view for. Overflow is stated, never silent.
   */
  laneRows: 5,
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

function parseISO(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// Whole days from `from` to `to`; negative when `to` is behind `from`. Rounded, so
// a DST hour inside the interval cannot bend a day into 0.96 of one.
function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

// The Monday of the week a date falls in — the phase `cadence_status` is defined
// on (Postgres `date_trunc('week', …)` is Monday-based).
function mondayOf(iso: string): string {
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

const READINESS_LABEL: Record<ReadinessKey, string> = {
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

// Every dated Piece's readiness, by Piece id — what a list of rows is handed so each
// row shows the mark without recomputing it, and so the arithmetic happens once, beside
// the render that decided what `today` is. Undated Pieces are absent, not null: an
// undated proposal has made no commitment to be late on.
export function readinessById(
  pieces: Array<Pick<Piece, "id" | "state" | "publish_date">>,
  today: string
): Record<string, Readiness> {
  const byId: Record<string, Readiness> = {};
  for (const p of pieces) {
    const r = readinessOf(p, today);
    if (r) byId[p.id] = r;
  }
  return byId;
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
// stay that way, so the missed ones come first — and the renderer exempts them from
// the row cap, because a backlog of missed dates must never push the week itself
// out of view.
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

// ── how much of the output is measured (#120) ─────────────────────────────────
// Completeness, counted **over Pieces** — the same metre as Cadence and the Flag mix.
// Three counts and their complement, and nothing else: this is what makes an empty
// per-Piece cell explicable rather than a puzzle.
export type MetricsCoverage = {
  /** Distinct post URLs with per-post rows. */
  measuredPosts: number;
  /** Pieces carrying a LinkedIn post URL. */
  linkedPieces: number;
  /** …of those, how many join a measured post. */
  withNumbers: number;
  /** Measured posts no Piece points at — expected, not a backlog (most are not output). */
  unlinkedPosts: number;
};

export function metricsCoverage(
  pieces: Array<Pick<Piece, "linkedin_post_url">>,
  posts: Array<{ post_url: string }>
): MetricsCoverage {
  const measured = new Set(posts.map((p) => p.post_url));
  const linked = pieces
    .map((p) => p.linkedin_post_url)
    .filter((url): url is string => url != null && url !== "");
  const linkedUrls = new Set(linked);
  return {
    measuredPosts: measured.size,
    linkedPieces: linked.length,
    withNumbers: linked.filter((url) => measured.has(url)).length,
    unlinkedPosts: [...measured].filter((url) => !linkedUrls.has(url)).length,
  };
}

// ── themes: what came in, what went out, and what shares an output (#120) ─────
// Counts, not judgement (ADR-0021 dec.1 — arithmetic over a target set held
// elsewhere): how many live Ideas carry a Theme, how many Pieces carry it, how those
// Pieces split Flag/Side, and which Themes appear on the same output. Coverage is
// counted **over Pieces** — the same metre as Cadence and the Flag mix — so a Theme
// says something about the output only once it is on the output.
//
// Nothing here ranks a Theme or infers what should be written next: `accumulating`
// is `ideas > pieces`, an arithmetic comparison of two counts of record.
export type ThemeNode = {
  id: string;
  label: string;
  archived: boolean;
  ideas: number; // live Ideas carrying it
  pieces: number; // non-declined Pieces carrying it
  flag: number;
  side: number;
  /** More Ideas in than Pieces out. A comparison of two counts, not a verdict. */
  accumulating: boolean;
};

/** Two Themes on the same output; `weight` is how many outputs they share. */
export type ThemeEdge = {
  a: string;
  b: string;
  aLabel: string;
  bLabel: string;
  weight: number;
};

export type ThemeGraph = { nodes: ThemeNode[]; edges: ThemeEdge[] };

// A Theme carried by an ARCHIVED Idea is not counted (the pool's live set is the
// subject), while a Theme that was itself archived after being assigned still counts
// and is marked `archived` — dropping it would hide output that exists. Both joins
// resolve labels against the whole vocabulary upstream (`getThemeContext`), so a
// retired Theme still reads as itself.
//
// Deterministic by construction, because the picture drawn from it has to be
// identical on every render to be worth arguing about: nodes sort by Pieces desc then
// label, edges by weight desc then the two labels, and every tie falls back to an id.
export function themeGraph(
  ideas: Array<{ status: IdeaStatus; themes: ThemeRef[] }>,
  pieces: Array<Pick<Piece, "id" | "state" | "flag_side">>,
  themesByPiece: Record<string, ThemeRef[]>
): ThemeGraph {
  const nodes = new Map<string, ThemeNode>();
  const touch = (t: ThemeRef): ThemeNode => {
    const existing = nodes.get(t.id);
    if (existing) return existing;
    const fresh: ThemeNode = {
      id: t.id,
      label: t.label,
      archived: t.archived,
      ideas: 0,
      pieces: 0,
      flag: 0,
      side: 0,
      accumulating: false,
    };
    nodes.set(t.id, fresh);
    return fresh;
  };

  for (const idea of ideas) {
    if (idea.status !== "live") continue;
    for (const t of idea.themes) touch(t).ideas += 1;
  }

  const edges = new Map<string, ThemeEdge>();
  for (const piece of pieces) {
    // A declined Piece is not output, the same exclusion the production arithmetic
    // above makes.
    if (piece.state === "declined") continue;
    const themes = themesByPiece[piece.id] ?? [];
    for (const t of themes) {
      const node = touch(t);
      node.pieces += 1;
      if (piece.flag_side === "flag") node.flag += 1;
      else node.side += 1;
    }
    // Co-occurrence on ONE output: every unordered pair of the Themes it carries.
    const pairwise = [...themes].sort((x, y) => x.id.localeCompare(y.id));
    for (let i = 0; i < pairwise.length; i++) {
      for (let j = i + 1; j < pairwise.length; j++) {
        const key = `${pairwise[i].id}|${pairwise[j].id}`;
        const edge = edges.get(key) ?? {
          a: pairwise[i].id,
          b: pairwise[j].id,
          aLabel: pairwise[i].label,
          bLabel: pairwise[j].label,
          weight: 0,
        };
        edge.weight += 1;
        edges.set(key, edge);
      }
    }
  }

  for (const node of nodes.values()) node.accumulating = node.ideas > node.pieces;

  return {
    nodes: [...nodes.values()].sort(
      (x, y) => y.pieces - x.pieces || x.label.localeCompare(y.label) || x.id.localeCompare(y.id)
    ),
    edges: [...edges.values()].sort(
      (x, y) =>
        y.weight - x.weight ||
        x.aLabel.localeCompare(y.aLabel) ||
        x.bLabel.localeCompare(y.bLabel) ||
        `${x.a}${x.b}`.localeCompare(`${y.a}${y.b}`)
    ),
  };
}

// How many Themes each Theme shares an output with — the graph's degree, which is
// what makes an isolated Theme a *fact* on the scoreboard and not only a picture with
// no lines touching it.
export function themeDegree(graph: ThemeGraph): Record<string, number> {
  const degree: Record<string, number> = {};
  for (const node of graph.nodes) degree[node.id] = 0;
  for (const edge of graph.edges) {
    degree[edge.a] = (degree[edge.a] ?? 0) + 1;
    degree[edge.b] = (degree[edge.b] ?? 0) + 1;
  }
  return degree;
}
