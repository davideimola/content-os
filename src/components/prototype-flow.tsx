"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PROTOTYPE — THROWAWAY. Do not merge to main. (wayfinder ticket #86)
//
// Plan: three variants of "seeing the flow", switchable via `?variant=` on the
// existing /pipeline route, plus `?demo=1` to inject synthetic stuck cases
// (the real Pipeline has 8 Pieces and nothing currently stuck).
//
//   live — the current lifecycle board (the thing being compared against)
//   A    — Flow rail + joints: the machine, system-wide, read-only
//   B    — Attention list: exceptions first, actions inline (stubbed)
//   C    — Per-Piece journey: one track per Piece, exposing the missing history
//   D    — Flow board: the board, with drag & drop, the read-only flow map (#83
//          ruled the canvas is a map and never an engine, described in code) and
//          C's journey in the drawer (added after Davide's reactions)
//
// Every "stuck" rule here is a *candidate* — it must agree with the fourth-Beat
// signal set (#88) if it survives. The point is to react to concrete flags.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ArrowRight,
  Ban,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDashed,
  Clock,
  Eye,
  EyeOff,
  Hand,
  HelpCircle,
  Pencil,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Fragment, useState } from "react";

import { CopyId } from "@/components/copy-id";
import { DetailSheet } from "@/components/detail/detail-sheet";
import { ChannelBadge, FlagBadge, formatDate, StateBadge } from "@/components/pipeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Piece, PieceMetrics, PieceState } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

// ── the "stuck" rule set (candidate — must agree with #88) ────────────────────

type Severity = 1 | 2 | 3;

type Flag = {
  code: string;
  // What is wrong, in Davide's words — not the rule's name.
  reason: string;
  severity: Severity;
  // The one move that clears it — the candidate primary action for variant B.
  action: string;
};

const days = (from: string, to: string): number =>
  Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);

// `today` is passed in from the server so the rules are deterministic (no
// hydration mismatch, no clock drift between render passes).
export function flagsFor(piece: Piece, all: Piece[], today: string): Flag[] {
  const out: Flag[] = [];
  const date = piece.publish_date;
  const untilDate = date ? days(today, date) : null;

  // Failure mode 2, declared: written, the date passed, never shipped.
  if (piece.state === "ready" && untilDate !== null && untilDate <= 0) {
    out.push({
      code: "overdue-ready",
      reason:
        untilDate === 0
          ? "written and due today — nothing has shipped it"
          : `written, due ${-untilDate}d ago, still not shipped`,
      severity: 1,
      action: "Mark shipped",
    });
  }

  // The slot passed without the piece ever being written.
  if (piece.state === "slotted" && untilDate !== null && untilDate < 0) {
    out.push({
      code: "slot-missed",
      reason: `slot was ${-untilDate}d ago and nothing was written`,
      severity: 1,
      action: "Reslot",
    });
  }

  // The slot is close and there is still no artifact — the Factory hasn't run.
  if (piece.state === "slotted" && untilDate !== null && untilDate >= 0 && untilDate <= 7) {
    if (!piece.artifact_url) {
      out.push({
        code: "empty-slot",
        reason: `due in ${untilDate}d with nothing written yet`,
        severity: 2,
        action: "Start writing",
      });
    }
  }

  // Failure mode 1's data hole: shipped, but unmeasurable — the metrics cross
  // joins on the post URL (ADR-0019), so an unlinked post is invisible.
  if (piece.state === "published" && piece.channel === "linkedin" && !piece.linkedin_post_url) {
    out.push({
      code: "unmeasurable",
      reason: "published but not linked to its LinkedIn post — no metrics will ever land",
      severity: 2,
      action: "Link post",
    });
  }

  // An amplifier that would go out before the blog it sneak-peeks.
  if (piece.blocked_by_piece_id) {
    const blocker = all.find((p) => p.id === piece.blocked_by_piece_id);
    if (blocker && blocker.state !== "published" && piece.state === "ready") {
      out.push({
        code: "ahead-of-blocker",
        reason: `ready before its blocker ("${blocker.title.slice(0, 40)}…") has shipped`,
        severity: 2,
        action: "Hold",
      });
    }
  }

  // Monday's signal, seen from here: a proposal nobody has judged.
  if (piece.state === "proposed") {
    const idle = days(piece.created_at, today);
    if (idle >= 21) {
      out.push({
        code: "stale-proposal",
        reason: `proposed ${idle}d ago and still unjudged`,
        severity: 3,
        action: "Judge",
      });
    }
  }

  return out.sort((a, b) => a.severity - b.severity);
}

const SEV_DOT: Record<Severity, string> = {
  1: "bg-red-500",
  2: "bg-amber-500",
  3: "bg-muted-foreground/50",
};

// ── the flow itself: stages, who watches them, and the joints between ────────
// This is the "which joints are automated" half of the ticket. Today the honest
// answer is: none of them. The rail says so out loud.

type StageDef = {
  state: PieceState;
  label: string;
  watcher: string | null; // the Beat that watches this stage, if any
};

const STAGES: StageDef[] = [
  { state: "proposed", label: "Proposed", watcher: "Monday Beat counts these" },
  { state: "slotted", label: "Slotted", watcher: "Thursday Beat guards the week's LinkedIn slot" },
  { state: "ready", label: "Ready", watcher: null },
  { state: "published", label: "Published", watcher: "Monthly Beat checks the metrics row" },
];

type JointMode = "hand-forever" | "open" | "automated";

type JointDef = {
  from: PieceState;
  to: PieceState;
  verb: string;
  who: string;
  mode: JointMode;
  note: string;
};

const JOINTS: JointDef[] = [
  {
    from: "proposed",
    to: "slotted",
    verb: "slot_piece",
    who: "Desk / console",
    mode: "hand-forever",
    note: "editorial judgement — ruled out of automation on the map",
  },
  {
    from: "slotted",
    to: "ready",
    verb: "mark_ready",
    who: "declared by hand in the drawer",
    mode: "open",
    note: "candidate fact: the artifact PR opens or lands (#87)",
  },
  {
    from: "ready",
    to: "published",
    verb: "publish_piece",
    who: "declared by hand in the drawer",
    mode: "open",
    note: "blog: Action on merge, one curl (#87) · LinkedIn: route undecided (#94)",
  },
];

const MODE_META: Record<JointMode, { label: string; icon: typeof Hand; cls: string }> = {
  "hand-forever": {
    label: "stays by hand",
    icon: Hand,
    cls: "border-border text-muted-foreground",
  },
  open: {
    label: "undecided",
    icon: HelpCircle,
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  automated: {
    label: "automated",
    icon: Bot,
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
};

// ── shared bits ──────────────────────────────────────────────────────────────

function ProtoNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs leading-relaxed">
      {children}
    </p>
  );
}

function FlagLine({ flag }: { flag: Flag }) {
  return (
    <span className="flex items-start gap-1.5 text-xs leading-snug">
      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", SEV_DOT[flag.severity])} />
      <span className={flag.severity === 1 ? "text-red-600 dark:text-red-400" : ""}>
        {flag.reason}
      </span>
    </span>
  );
}

type VariantProps = { pieces: Piece[]; today: string };

// ═════════════════════════════════════════════════════════════════════════════
// VARIANT A — Flow rail + joints
// The system as a machine: stages with counts, the joint between each pair
// labelled with who moves it, and which Beat (if any) watches each stage.
// Read-only by design — you look at it to understand, not to act.
// ═════════════════════════════════════════════════════════════════════════════

export function VariantA({ pieces, today }: VariantProps) {
  const stuckCount = pieces.filter((p) => flagsFor(p, pieces, today).length > 0).length;

  return (
    <div className="flex flex-col gap-4">
      <ProtoNote>
        <strong className="text-foreground">A — Flow rail + joints.</strong> The machine, end to
        end: what sits in each stage, which Beat watches it, and who moves a Piece across each
        joint. Today <strong className="text-foreground">no joint is automated</strong> —{" "}
        {stuckCount === 0 ? "nothing is flagged" : `${stuckCount} flagged`}.
      </ProtoNote>

      {/* The rail: vertical on mobile, horizontal from lg up. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        {STAGES.map((stage, i) => {
          const items = pieces.filter((p) => p.state === stage.state);
          const joint = JOINTS.find((j) => j.from === stage.state);
          return (
            <div key={stage.state} className="flex flex-col gap-3 lg:flex-1 lg:flex-row">
              <Card className="flex-1 gap-3 p-3">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold tracking-tight">{stage.label}</h3>
                  <span className="text-muted-foreground text-xs tabular-nums">{items.length}</span>
                </div>

                {/* Who is watching this stage — the hole is the point. */}
                <div
                  className={cn(
                    "flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[0.7rem] leading-snug",
                    stage.watcher
                      ? "text-muted-foreground border-border"
                      : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
                  )}
                >
                  {stage.watcher ? (
                    <Eye aria-hidden className="mt-0.5 size-3 shrink-0" />
                  ) : (
                    <EyeOff aria-hidden className="mt-0.5 size-3 shrink-0" />
                  )}
                  <span>{stage.watcher ?? "nothing watches this stage"}</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  {items.length === 0 ? (
                    <p className="text-muted-foreground py-2 text-center text-xs italic">empty</p>
                  ) : (
                    items.map((p) => {
                      const flags = flagsFor(p, pieces, today);
                      const worst = flags[0];
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            "flex flex-col gap-1 rounded-md border px-2 py-1.5",
                            worst?.severity === 1
                              ? "border-red-500/40 bg-red-500/5"
                              : worst
                                ? "border-amber-500/40 bg-amber-500/5"
                                : "border-border"
                          )}
                        >
                          <p className="line-clamp-2 text-xs leading-snug font-medium">{p.title}</p>
                          <div className="text-muted-foreground flex items-center gap-1.5 text-[0.7rem]">
                            <span className="uppercase tracking-wide">{p.channel}</span>
                            <span>·</span>
                            <span>{formatDate(p.publish_date) ?? "no date"}</span>
                          </div>
                          {worst ? <FlagLine flag={worst} /> : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>

              {/* The joint between this stage and the next. */}
              {joint ? <Joint joint={joint} /> : null}
              {i === STAGES.length - 1 ? null : null}
            </div>
          );
        })}
      </div>

      <ProtoNote>
        <Clock aria-hidden className="mr-1 inline size-3" />
        The rail shows <em>where things are</em>, never <em>when they got there</em>: there is no
        transition history in the schema — only <code>updated_at</code>. Ageing a Piece inside a
        stage (&ldquo;3 weeks in Ready&rdquo;) needs data we do not record today.
      </ProtoNote>
    </div>
  );
}

function Joint({ joint }: { joint: JointDef }) {
  const meta = MODE_META[joint.mode];
  const Icon = meta.icon;
  return (
    <div className="flex shrink-0 items-center justify-center lg:w-40">
      <div className="flex w-full flex-col items-center gap-1">
        <ArrowRight aria-hidden className="text-muted-foreground size-4 rotate-90 lg:rotate-0" />
        <div
          className={cn(
            "flex w-full flex-col items-center gap-1 rounded-md border px-2 py-1.5 text-center",
            meta.cls
          )}
        >
          <span className="inline-flex items-center gap-1 text-[0.7rem] font-medium">
            <Icon aria-hidden className="size-3" />
            {meta.label}
          </span>
          <code className="text-[0.65rem] opacity-80">{joint.verb}</code>
          <span className="text-[0.65rem] leading-tight opacity-80">{joint.who}</span>
          <span className="text-[0.6rem] leading-tight opacity-70">{joint.note}</span>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANT B — Attention list
// No board. One severity-ordered list of exceptions, each with the single move
// that clears it. Everything healthy collapses into a one-line all-clear.
// The console tells you what is broken instead of showing you what exists.
// ═════════════════════════════════════════════════════════════════════════════

export function VariantB({ pieces, today }: VariantProps) {
  const flagged = pieces
    .map((p) => ({ piece: p, flags: flagsFor(p, pieces, today) }))
    .filter((r) => r.flags.length > 0)
    .sort((a, b) => a.flags[0].severity - b.flags[0].severity);
  const clean = pieces.filter((p) => flagsFor(p, pieces, today).length === 0);

  return (
    <div className="flex flex-col gap-4">
      <ProtoNote>
        <strong className="text-foreground">B — Attention list.</strong> Exceptions first: the view
        is a queue of things that need Davide, not a picture of the pipeline. Actions are{" "}
        <strong className="text-foreground">stubs</strong> here (they write nothing) — the question
        is whether this view should carry them at all.
      </ProtoNote>

      <section className="flex flex-col gap-2">
        <h2 className="flex items-baseline gap-2 px-1 text-sm font-semibold tracking-tight">
          Needs you
          <span className="text-muted-foreground text-xs tabular-nums">{flagged.length}</span>
        </h2>

        {flagged.length === 0 ? (
          <Card className="items-center gap-2 border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
            <Check aria-hidden className="size-5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-medium">Nothing stuck.</p>
            <p className="text-muted-foreground text-xs">
              Silence is the all-clear — the same rule the Beats follow (ADR-0013).
            </p>
          </Card>
        ) : (
          flagged.map(({ piece, flags }) => (
            <Card key={piece.id} className="gap-2 p-3">
              <div className="flex items-start gap-2">
                <span
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEV_DOT[flags[0].severity])}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p className="text-sm leading-snug font-medium text-pretty">{piece.title}</p>
                  <div className="flex flex-col gap-1">
                    {flags.map((f) => (
                      <FlagLine key={f.code} flag={f} />
                    ))}
                  </div>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-[0.7rem]">
                    <span className="uppercase tracking-wide">{piece.channel}</span>
                    <span>·</span>
                    <span>{piece.state}</span>
                    <span>·</span>
                    <span>{formatDate(piece.publish_date) ?? "no date"}</span>
                  </div>
                </div>
              </div>
              {/* The one move that clears the worst flag, plus a quiet dismiss. */}
              <div className="flex flex-wrap gap-1.5 pl-4">
                <Button size="xs" disabled>
                  {flags[0].action}
                </Button>
                <Button size="xs" variant="ghost" disabled>
                  <Ban aria-hidden />
                  Not stuck
                </Button>
                <span className="text-muted-foreground self-center text-[0.65rem] italic">
                  stub — writes nothing
                </span>
              </div>
            </Card>
          ))
        )}
      </section>

      {/* Everything healthy: one line per stage, expandable. */}
      <details className="rounded-lg border">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium">
          <ChevronDown aria-hidden className="size-3.5" />
          Flowing fine
          <span className="text-muted-foreground tabular-nums">{clean.length}</span>
        </summary>
        <div className="flex flex-col gap-2 border-t px-3 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s) => (
              <Badge key={s.state} variant="outline" className="font-normal tabular-nums">
                {s.label} {clean.filter((p) => p.state === s.state).length}
              </Badge>
            ))}
          </div>
          {clean.map((p) => (
            <div key={p.id} className="text-muted-foreground flex items-baseline gap-2 text-xs">
              <CircleDashed aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{p.title}</span>
              <span className="ml-auto shrink-0 text-[0.7rem]">{p.state}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANT C — Per-Piece journey
// One track per Piece: idea → slotted → ready → published, dated where a date
// actually exists. Three of the four stops have no recorded timestamp, so the
// track shows "?" — which is the whole argument about the contract change.
// ═════════════════════════════════════════════════════════════════════════════

const TRACK: { state: PieceState; label: string }[] = [
  { state: "proposed", label: "Proposed" },
  { state: "slotted", label: "Slotted" },
  { state: "ready", label: "Ready" },
  { state: "published", label: "Published" },
];

// What we can honestly date, per stop:
//   proposed  → created_at (recorded)
//   slotted   → unknown (publish_date is the *intent*, not the moment it was slotted)
//   ready     → unknown
//   published → publish_date, which is intent too — the real moment isn't stored
function stopDate(piece: Piece, state: PieceState): { text: string; known: boolean } {
  if (state === "proposed") return { text: formatDate(piece.created_at) ?? "—", known: true };
  if (state === "published" && piece.publish_date)
    return { text: `${formatDate(piece.publish_date)} (planned)`, known: false };
  return { text: "not recorded", known: false };
}

// The journey track, extracted so variant D can show it *on demand* instead of on
// every row — Davide's reaction to C: the information is wanted, the permanent
// per-row cost is not.
export function JourneyTrack({ piece, today }: { piece: Piece; today: string }) {
  const reachedIdx = TRACK.findIndex((t) => t.state === piece.state);
  const lastTouch = days(piece.updated_at, today);
  return (
    <div className="flex flex-col gap-1.5">
      {/* Horizontal on desktop, stacked on mobile. */}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-4">
        {TRACK.map((stop, i) => {
          const reached = i <= reachedIdx;
          const current = i === reachedIdx;
          const d = reached ? stopDate(piece, stop.state) : null;
          return (
            <div
              key={stop.state}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2 py-1.5 sm:flex-col sm:items-start sm:gap-0.5",
                current
                  ? "border-foreground/30 bg-muted/50"
                  : reached
                    ? "border-border"
                    : "border-dashed opacity-50"
              )}
            >
              <span className="flex items-center gap-1 text-[0.7rem] font-medium">
                {reached ? (
                  <Check aria-hidden className="size-3 text-emerald-500" />
                ) : (
                  <CircleDashed aria-hidden className="text-muted-foreground size-3" />
                )}
                {stop.label}
              </span>
              <span
                className={cn(
                  "text-[0.65rem] tabular-nums",
                  d?.known ? "text-muted-foreground" : "text-amber-700 italic dark:text-amber-400"
                )}
              >
                {d ? d.text : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem]">
        <span className="inline-flex items-center gap-1">
          <Clock aria-hidden className="size-3" />
          last touched {lastTouch}d ago
          <span className="italic opacity-70">(any field, not a transition)</span>
        </span>
        {piece.artifact_url ? <span>artifact linked</span> : <span>no artifact</span>}
      </div>
    </div>
  );
}

export function VariantC({ pieces, today }: VariantProps) {
  // Read in flow direction — proposed first, published last — so the list mirrors
  // the rail in variant A rather than reversing it.
  const ordered = [...pieces].sort(
    (a, b) =>
      TRACK.findIndex((t) => t.state === a.state) - TRACK.findIndex((t) => t.state === b.state)
  );

  return (
    <div className="flex flex-col gap-4">
      <ProtoNote>
        <strong className="text-foreground">C — Per-Piece journey.</strong> One track per Piece:
        where it got to, and when. Every <em>not recorded</em> below is a timestamp the schema does
        not hold — only <code>updated_at</code>, which is the last touch of <em>anything</em>, not
        an entry into a stage.
      </ProtoNote>

      <div className="flex flex-col gap-2">
        {ordered.map((piece) => {
          const flags = flagsFor(piece, pieces, today);
          return (
            <Card key={piece.id} className="gap-3 p-3">
              <div className="flex flex-wrap items-start gap-2">
                <p className="min-w-0 flex-1 text-sm leading-snug font-medium text-pretty">
                  {piece.title}
                </p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <ChannelBadge channel={piece.channel} />
                  <FlagBadge flagSide={piece.flag_side} />
                </div>
              </div>

              <JourneyTrack piece={piece} today={today} />

              {flags.length > 0 ? (
                <div className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1.5">
                  {flags.map((f) => (
                    <FlagLine key={f.code} flag={f} />
                  ))}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <ProtoNote>
        <TriangleAlert aria-hidden className="mr-1 inline size-3" />
        To fill the gaps this variant leaves blank, the contract would need transition timestamps —
        a <code>piece_events</code> table or per-state columns, written by the RPC verbs. That is a
        contract change (#87 / #93 territory), not a UI change.
      </ProtoNote>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANT D — Flow board (drag & drop), journey on demand
// Davide's reaction to A/B/C: the board is the congenial container, dragging is
// the move he wants, and C's information is welcome but must not cost a row of
// screen for every Piece.
//
// So: the existing four columns, plus (a) the stuck flag on the card, (b) the
// joint printed in each column header, (c) drag & drop between columns, and
// (d) C's journey track behind a per-card expander.
//
// The interesting part is what dragging *reveals*: the lifecycle is not a free
// kanban. `slot_piece` needs a date, `publish_piece` accepts only slotted/ready,
// and nothing un-publishes or un-readies a Piece — so half the drop targets must
// refuse, out loud. Every accepted drop moves the card in local state only and
// appends the RPC call it *would* have made to the verb log at the bottom.
// ═════════════════════════════════════════════════════════════════════════════

// Two kinds of "no", and the difference is the whole point (#83's resolution):
//   guarded — the VERB refuses server-side. Only `mark_ready` (slotted → ready)
//             and `publish_piece` ({slotted, ready} → published) have from-state
//             guards.
//   ui      — the verb would happily accept it. `slot_piece`, `deslot_piece` and
//             `decline_piece` carry NO from-state guard, so `slot_piece` on a
//             published Piece silently resurrects it. Only the UI stands between
//             that and the data — which is #87's fourth bullet, made visible.
type Move =
  | { ok: true; verb: string; needsDate: boolean; guarded: boolean }
  | { ok: false; kind: "guarded" | "ui"; why: string };

function moveFor(from: PieceState, to: PieceState): Move {
  if (from === to) return { ok: false, kind: "ui", why: "already there" };

  if (from === "proposed" && to === "slotted")
    return { ok: true, verb: "slot_piece", needsDate: true, guarded: false };
  if (from === "slotted" && to === "proposed")
    return { ok: true, verb: "deslot_piece", needsDate: false, guarded: false };
  if (from === "slotted" && to === "ready")
    return { ok: true, verb: "mark_ready", needsDate: false, guarded: true };
  if ((from === "slotted" || from === "ready") && to === "published")
    return { ok: true, verb: "publish_piece", needsDate: false, guarded: true };

  // Real refusals — the verb's own guard says no.
  if (to === "ready")
    return { ok: false, kind: "guarded", why: "mark_ready guards slotted → ready" };
  if (to === "published")
    return {
      ok: false,
      kind: "guarded",
      why: "publish_piece guards {slotted, ready} → published",
    };

  // Everything else: the verb would accept it. Nothing but this UI says no.
  if (from === "published")
    return {
      ok: false,
      kind: "ui",
      why: "slot_piece / deslot_piece are unguarded — this would silently resurrect it (#87)",
    };
  return {
    ok: false,
    kind: "ui",
    why: "deslot_piece / slot_piece are unguarded — the UI refuses the regression (#87)",
  };
}

// ── the flow map (read-only) ─────────────────────────────────────────────────
// #83 ruled: a drawn graph is a MAP, never an engine, and its description lives
// in code — never in the DB. This is that description, and the whole drawing:
// dependency-free inline SVG, following the console's trend-chart precedent
// rather than adding react-flow.
type Edge = {
  from: PieceState;
  to: PieceState;
  verb: string;
  guarded: boolean;
  // "offered" = the board lets you do it; "risk" = the verb allows it and nobody
  // guards it, so it is drawn as the hole it is.
  kind: "offered" | "risk";
  label?: string;
};

const EDGES: Edge[] = [
  { from: "proposed", to: "slotted", verb: "slot_piece", guarded: false, kind: "offered" },
  { from: "slotted", to: "ready", verb: "mark_ready", guarded: true, kind: "offered" },
  { from: "ready", to: "published", verb: "publish_piece", guarded: true, kind: "offered" },
  { from: "slotted", to: "proposed", verb: "deslot_piece", guarded: false, kind: "offered" },
  {
    from: "published",
    to: "slotted",
    verb: "slot_piece",
    guarded: false,
    kind: "risk",
    label: "unguarded — silently resurrects a published Piece (#87)",
  },
];

const NODE_X: Record<PieceState, number> = {
  proposed: 8,
  slotted: 168,
  ready: 328,
  published: 488,
  declined: 0,
};
const NODE_W = 132;
const NODE_Y = 62;
const NODE_H = 34;
const cx = (st: PieceState) => NODE_X[st] + NODE_W / 2;

function FlowMap({ pieces }: { pieces: Piece[] }) {
  const count = (st: PieceState) => pieces.filter((p) => p.state === st).length;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border p-3">
      <h3 className="flex flex-wrap items-center gap-1.5 text-xs font-semibold tracking-tight">
        The flow
        <span className="text-muted-foreground font-normal">
          — a map, not an engine (#83): drawn from a description in code, it executes nothing
        </span>
      </h3>
      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 632 150"
          className="text-foreground h-[150px] w-[632px] min-w-[632px]"
          role="img"
          aria-label="The Piece lifecycle: proposed, slotted, ready, published, with the RPC verb on each transition"
        >
          <title>Piece lifecycle and the verbs that move it</title>
          {/* forward edges, above the nodes */}
          {EDGES.filter((e) => e.kind === "offered" && NODE_X[e.from] < NODE_X[e.to]).map((e) => {
            const x1 = NODE_X[e.from] + NODE_W;
            const x2 = NODE_X[e.to];
            return (
              <g key={`${e.from}-${e.to}`}>
                <line
                  x1={x1}
                  y1={NODE_Y + NODE_H / 2}
                  x2={x2 - 6}
                  y2={NODE_Y + NODE_H / 2}
                  stroke="currentColor"
                  strokeOpacity="0.35"
                />
                <polygon
                  points={`${x2},${NODE_Y + NODE_H / 2} ${x2 - 6},${NODE_Y + NODE_H / 2 - 3.5} ${x2 - 6},${NODE_Y + NODE_H / 2 + 3.5}`}
                  fill="currentColor"
                  fillOpacity="0.45"
                />
                <text
                  x={(x1 + x2) / 2}
                  y={NODE_Y + NODE_H / 2 - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fontFamily="ui-monospace, monospace"
                  fill="currentColor"
                  fillOpacity="0.75"
                >
                  {e.verb}
                </text>
                <text
                  x={(x1 + x2) / 2}
                  y={NODE_Y + NODE_H / 2 + 14}
                  textAnchor="middle"
                  fontSize="8"
                  fill="currentColor"
                  fillOpacity="0.45"
                >
                  {e.guarded ? "guarded" : "no guard"}
                </text>
              </g>
            );
          })}

          {/* the one backward edge that is offered: deslot */}
          <path
            d={`M ${cx("slotted")} ${NODE_Y} C ${cx("slotted")} ${NODE_Y - 34}, ${cx("proposed")} ${NODE_Y - 34}, ${cx("proposed")} ${NODE_Y}`}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.3"
          />
          <text
            x={(cx("proposed") + cx("slotted")) / 2}
            y={NODE_Y - 26}
            textAnchor="middle"
            fontSize="9"
            fontFamily="ui-monospace, monospace"
            fill="currentColor"
            fillOpacity="0.6"
          >
            deslot_piece
          </text>

          {/* the risk edge: allowed by the verb, offered by nobody */}
          {EDGES.filter((e) => e.kind === "risk").map((e) => (
            <g key={`risk-${e.from}-${e.to}`} className="text-red-600 dark:text-red-400">
              <path
                d={`M ${cx(e.from)} ${NODE_Y + NODE_H} C ${cx(e.from)} ${NODE_Y + NODE_H + 40}, ${cx(e.to)} ${NODE_Y + NODE_H + 40}, ${cx(e.to)} ${NODE_Y + NODE_H}`}
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.7"
                strokeDasharray="4 3"
              />
              <text
                x={(cx(e.to) + cx(e.from)) / 2}
                y={NODE_Y + NODE_H + 52}
                textAnchor="middle"
                fontSize="8.5"
                fill="currentColor"
              >
                {e.verb} — {e.label}
              </text>
            </g>
          ))}

          {/* nodes */}
          {STAGES.map((stage) => (
            <g key={stage.state}>
              <rect
                x={NODE_X[stage.state]}
                y={NODE_Y}
                width={NODE_W}
                height={NODE_H}
                rx="7"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.35"
              />
              <text
                x={NODE_X[stage.state] + 10}
                y={NODE_Y + 21}
                fontSize="11"
                fontWeight="600"
                fill="currentColor"
              >
                {stage.label}
              </text>
              <text
                x={NODE_X[stage.state] + NODE_W - 10}
                y={NODE_Y + 21}
                textAnchor="end"
                fontSize="11"
                fill="currentColor"
                fillOpacity="0.5"
              >
                {count(stage.state)}
              </text>
              {stage.watcher ? null : (
                <text
                  x={NODE_X[stage.state] + NODE_W / 2}
                  y={NODE_Y + NODE_H + 13}
                  textAnchor="middle"
                  fontSize="8"
                  className="fill-red-600 dark:fill-red-400"
                >
                  no Beat watches this
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <p className="text-muted-foreground text-[0.65rem]">
        Five edges drawn; a sixth, <code>publish_piece</code> from <em>slotted</em>, skips Ready
        entirely. Two are guarded by their verb — the dashed one is legal in the contract and
        offered by nothing, the gap this board holds shut by hand.
      </p>
    </div>
  );
}

export function VariantD({
  pieces: initial,
  today,
  metrics,
}: VariantProps & { metrics?: Record<string, PieceMetrics | undefined> }) {
  // Local only — the prototype never writes (see the verb log instead).
  const [pieces, setPieces] = useState(initial);
  const [log, setLog] = useState<{ seq: number; line: string }[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overState, setOverState] = useState<PieceState | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pendingDate, setPendingDate] = useState<{ id: string; value: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const dragged = pieces.find((p) => p.id === dragId) ?? null;

  // Every stubbed write lands here instead of the database — the log doubles as
  // proof that the UI holds no logic of its own: it only names RPC verbs.
  function logVerb(line: string) {
    setLog((prev) => [{ seq: prev.length + 1, line }, ...prev]);
  }

  function apply(id: string, to: PieceState, verb: string, date?: string) {
    setPieces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, state: to, publish_date: date ?? p.publish_date } : p))
    );
    const piece = pieces.find((p) => p.id === id);
    logVerb(
      `${verb}(${id.slice(0, 8)}${date ? `, "${date}"` : ""}) — ${piece?.title.slice(0, 44)}…`
    );
  }

  function onDrop(to: PieceState) {
    setOverState(null);
    if (!dragged) return;
    const move = moveFor(dragged.state, to);
    setDragId(null);
    if (!move.ok) {
      setRefusal(
        `${dragged.state} → ${to}: ${move.kind === "guarded" ? "the verb refuses" : "only this UI refuses"} — ${move.why}`
      );
      return;
    }
    setRefusal(null);
    if (move.needsDate) {
      setPendingDate({ id: dragged.id, value: today });
      return;
    }
    apply(dragged.id, to, move.verb);
  }

  return (
    <div className="flex flex-col gap-4">
      <ProtoNote>
        <strong className="text-foreground">D — Flow board, journey on demand.</strong> The board
        you already have, plus the three things it can&apos;t show: the stuck flag on the card, the{" "}
        <em>joint</em> in each column header, and C&apos;s journey behind a chevron. Drag a card
        between columns — <strong className="text-foreground">nothing is written</strong>; every
        accepted drop appends the RPC call it would have made to the log at the bottom, and every
        refused drop says <em>who</em> refuses — the verb&apos;s own guard, or only this UI (#83:
        just <code>mark_ready</code> and <code>publish_piece</code> guard their from-state).
      </ProtoNote>

      <FlowMap pieces={pieces} />

      {/* Drop refused — the contract talking back. */}
      {refusal ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <Ban aria-hidden className="size-3.5 shrink-0" />
          <span>{refusal}</span>
          <button type="button" onClick={() => setRefusal(null)} className="ml-auto underline">
            dismiss
          </button>
        </div>
      ) : null}

      {/* slot_piece needs a date — a drop into Slotted cannot be a pure drag. */}
      {pendingDate ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs">
          <CalendarDays aria-hidden className="size-3.5 shrink-0" />
          <span>
            <code>slot_piece</code> needs a date:
          </span>
          <input
            type="date"
            value={pendingDate.value}
            onChange={(e) => setPendingDate({ ...pendingDate, value: e.target.value })}
            className="rounded border bg-background px-1.5 py-0.5"
          />
          <Button
            size="xs"
            onClick={() => {
              apply(pendingDate.id, "slotted", "slot_piece", pendingDate.value);
              setPendingDate(null);
            }}
          >
            Slot it
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setPendingDate(null)}>
            Cancel
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STAGES.map((stage) => {
          const items = pieces.filter((p) => p.state === stage.state);
          const joint = JOINTS.find((j) => j.from === stage.state);
          const preview = dragged ? moveFor(dragged.state, stage.state) : null;
          const isTarget = overState === stage.state;
          return (
            <section
              key={stage.state}
              aria-label={`${stage.label} column`}
              onDragOver={(e) => {
                e.preventDefault();
                setOverState(stage.state);
              }}
              onDragLeave={() => setOverState((s) => (s === stage.state ? null : s))}
              onDrop={() => onDrop(stage.state)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-2 transition-colors",
                isTarget && preview?.ok && "border-emerald-500/60 bg-emerald-500/5",
                isTarget && preview && !preview.ok && "border-red-500/60 bg-red-500/5",
                !isTarget && "border-transparent"
              )}
            >
              <header className="flex flex-col gap-1 px-1">
                <h2 className="flex items-baseline gap-2 text-sm font-semibold tracking-tight">
                  {stage.label}
                  <span className="text-muted-foreground text-xs tabular-nums">{items.length}</span>
                  {stage.watcher ? null : (
                    <span
                      title="no Beat watches this stage"
                      className="text-red-600 dark:text-red-400"
                    >
                      <EyeOff aria-hidden className="size-3.5" />
                    </span>
                  )}
                </h2>
                {/* The joint out of this column — the automation status, in the header. */}
                {joint ? (
                  <span
                    className={cn(
                      "inline-flex w-fit items-center gap-1 rounded border px-1.5 py-0.5 text-[0.65rem]",
                      MODE_META[joint.mode].cls
                    )}
                    title={joint.note}
                  >
                    {joint.mode === "hand-forever" ? (
                      <Hand aria-hidden className="size-2.5" />
                    ) : (
                      <HelpCircle aria-hidden className="size-2.5" />
                    )}
                    <code>{joint.verb}</code>
                    <ArrowRight aria-hidden className="size-2.5" />
                    {MODE_META[joint.mode].label}
                  </span>
                ) : null}
                {/* While dragging, each column says up front whether it will accept. */}
                {preview ? (
                  <span
                    className={cn(
                      "text-[0.65rem]",
                      preview.ok
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {preview.ok
                      ? `drop → ${preview.verb}${preview.guarded ? "" : " (verb has no guard)"}`
                      : `${preview.kind === "guarded" ? "verb refuses" : "UI refuses"} — ${preview.why}`}
                  </span>
                ) : null}
              </header>

              <div className="flex flex-col gap-2">
                {items.length === 0 ? (
                  <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center text-xs">
                    empty
                  </p>
                ) : (
                  items.map((piece) => {
                    const flags = flagsFor(piece, pieces, today);
                    const worst = flags[0];
                    return (
                      <Fragment key={piece.id}>
                        {/* Compact card: title, meta, worst flag. Everything else moved
                              into the drawer — a column is ~280px wide and the journey did
                              not fit there (Davide, on the inline version). */}
                        <button
                          type="button"
                          draggable
                          onDragStart={() => setDragId(piece.id)}
                          onDragEnd={() => {
                            setDragId(null);
                            setOverState(null);
                          }}
                          onClick={() => setOpenId(piece.id)}
                          className={cn(
                            "block w-full cursor-grab text-left active:cursor-grabbing",
                            dragId === piece.id && "opacity-40"
                          )}
                        >
                          <Card
                            className={cn(
                              "gap-1.5 p-3 transition-colors hover:border-foreground/20",
                              worst?.severity === 1 && "border-red-500/50",
                              worst?.severity === 2 && "border-amber-500/50"
                            )}
                          >
                            <p className="text-xs leading-snug font-medium text-pretty">
                              {piece.title}
                            </p>
                            <div className="text-muted-foreground flex items-center gap-1.5 text-[0.7rem]">
                              <span className="uppercase tracking-wide">{piece.channel}</span>
                              <span>·</span>
                              <span>{formatDate(piece.publish_date) ?? "no date"}</span>
                              <span>·</span>
                              <span>{piece.flag_side}</span>
                            </div>
                            {worst ? <FlagLine flag={worst} /> : null}
                          </Card>
                        </button>

                        <ProtoPieceDrawer
                          piece={piece}
                          today={today}
                          flags={flags}
                          metrics={metrics?.[piece.id]}
                          onVerb={logVerb}
                          open={openId === piece.id}
                          onOpenChange={(o) => setOpenId(o ? piece.id : null)}
                          onMove={(to) => {
                            const m = moveFor(piece.state, to);
                            if (!m.ok) return;
                            if (m.needsDate) setPendingDate({ id: piece.id, value: today });
                            else apply(piece.id, to, m.verb);
                            setOpenId(null);
                          }}
                        />
                      </Fragment>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Surface the state: what the drags would have called. */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold">
          <Bot aria-hidden className="size-3.5" />
          RPC calls this board would have made
          <span className="text-muted-foreground font-normal tabular-nums">{log.length}</span>
        </h3>
        {log.length === 0 ? (
          <p className="text-muted-foreground text-xs italic">
            nothing yet — drag a card, or open one and use “move to”
          </p>
        ) : (
          <ol className="flex flex-col gap-0.5">
            {log.map((entry) => (
              <li key={entry.seq} className="text-muted-foreground font-mono text-[0.7rem]">
                {entry.line}
              </li>
            ))}
          </ol>
        )}
        <p className="text-muted-foreground text-[0.65rem] italic">
          stub — every move is local state; reload restores the real Pipeline.
        </p>
      </div>
    </div>
  );
}

// The drawer: where the space is. The card stays compact and this holds the
// history, the flags and the moves — Davide's call after seeing the journey
// squeezed into a ~280px column. Reuses the console's real DetailSheet (right
// Sheet on desktop, bottom sheet on mobile). The moves are stubs.
function ProtoPieceDrawer({
  piece,
  today,
  flags,
  metrics,
  open,
  onOpenChange,
  onMove,
  onVerb,
}: {
  piece: Piece;
  today: string;
  flags: Flag[];
  metrics?: PieceMetrics;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMove: (to: PieceState) => void;
  onVerb: (line: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(piece.title);
  const [artifact, setArtifact] = useState(piece.artifact_url ?? "");
  const [postUrl, setPostUrl] = useState(piece.linkedin_post_url ?? "");
  const short = piece.id.slice(0, 8);

  return (
    <DetailSheet open={open} onOpenChange={onOpenChange} title={piece.title}>
      <div className="flex flex-wrap items-center gap-1.5">
        <StateBadge state={piece.state} />
        <ChannelBadge channel={piece.channel} />
        <FlagBadge flagSide={piece.flag_side} />
        <CopyId id={piece.id} className="ml-auto" />
      </div>

      {/* Rename — the drawer's existing edit, kept. */}
      {renaming ? (
        <div className="flex flex-col gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8"
            aria-label="Title"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onVerb(`edit_piece(${short}, "${title.slice(0, 32)}…")`);
                setRenaming(false);
              }}
              disabled={!title.trim()}
            >
              Save title
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTitle(piece.title);
                setRenaming(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="-ml-2.5 w-fit"
          onClick={() => setRenaming(true)}
        >
          <Pencil />
          Rename
        </Button>
      )}

      {flags.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
          {flags.map((f) => (
            <FlagLine key={f.code} flag={f} />
          ))}
        </div>
      ) : null}

      {/* NEW — the history. Replaces the drawer's single "Publish: <date>" row,
          which it contains. */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-tight">History</h3>
        <JourneyTimeline piece={piece} today={today} />
        {piece.blocked_by_piece_id ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-[0.7rem]">
            blocked by <CopyId id={piece.blocked_by_piece_id} />
          </p>
        ) : null}
      </section>

      {/* NEW — one Move section replacing Schedule + Ready + Publish + Deslot:
          four headings and three date-less buttons collapse into one row per
          destination, each naming the verb it calls or why it refuses. */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-tight">Move</h3>
        <div className="flex flex-col gap-1.5">
          {STAGES.filter((s) => s.state !== piece.state).map((s) => {
            const m = moveFor(piece.state, s.state);
            return (
              <div key={s.state} className="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!m.ok}
                  onClick={() => onMove(s.state)}
                  className="w-28 justify-start"
                >
                  <ArrowRight aria-hidden />
                  {s.label}
                </Button>
                <span
                  className={cn(
                    "flex items-start gap-1 text-[0.7rem]",
                    m.ok
                      ? "text-muted-foreground font-mono"
                      : m.kind === "guarded"
                        ? "text-muted-foreground italic"
                        : "text-amber-700 italic dark:text-amber-400"
                  )}
                >
                  {m.ok ? null : m.kind === "guarded" ? (
                    <ShieldCheck aria-hidden className="mt-0.5 size-3 shrink-0" />
                  ) : (
                    <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
                  )}
                  {m.ok ? `${m.verb}${m.needsDate ? "(id, date)" : "(id)"}` : m.why}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* The links, editable — what the reduced version had dropped. */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-tight">Artifact URL</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={artifact}
            onChange={(e) => setArtifact(e.target.value)}
            placeholder="https://…"
            className="h-8 min-w-0 flex-1"
            aria-label="Artifact URL"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!artifact.trim()}
            onClick={() => onVerb(`set_piece_artifact(${short}, "${artifact}")`)}
          >
            Save
          </Button>
        </div>
        {piece.artifact_url ? (
          <a
            href={piece.artifact_url}
            target="_blank"
            rel="noreferrer"
            className="text-primary text-[0.7rem] break-all underline underline-offset-2"
          >
            {piece.artifact_url}
          </a>
        ) : null}
      </section>

      {piece.channel === "linkedin" ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-tight">LinkedIn post</h3>
          {metrics?.linkedin ? (
            <p className="flex flex-wrap items-baseline gap-x-3 text-xs">
              <span>
                <span className="font-semibold tabular-nums">
                  {metrics.linkedin.impressions.toLocaleString("en-GB")}
                </span>{" "}
                <span className="text-muted-foreground">impressions</span>
              </span>
              <span>
                <span className="font-semibold tabular-nums">
                  {metrics.linkedin.engagements.toLocaleString("en-GB")}
                </span>{" "}
                <span className="text-muted-foreground">engagements</span>
              </span>
            </p>
          ) : (
            <p className="text-muted-foreground text-[0.7rem]">
              {piece.linkedin_post_url
                ? "Linked — no metrics ingested yet."
                : "Link the post to see impressions & engagements."}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              placeholder="https://www.linkedin.com/posts/…"
              className="h-8 min-w-0 flex-1"
              aria-label="LinkedIn post URL"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!postUrl.trim()}
              onClick={() => onVerb(`set_piece_linkedin_url(${short}, "${postUrl}")`)}
            >
              {piece.linkedin_post_url ? "Update" : "Link"}
            </Button>
          </div>
        </section>
      ) : null}

      {piece.channel === "blog" && metrics?.siteVisitors != null ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold tracking-tight">Site</h3>
          <p className="text-muted-foreground text-[0.7rem]">
            <span className="text-foreground font-semibold tabular-nums">
              {metrics.siteVisitors.toLocaleString("en-GB")}
            </span>{" "}
            visitors that month <span className="italic">(site-wide, not this page)</span>
          </p>
        </section>
      ) : null}

      <div className="flex items-center gap-2 border-t pt-4">
        <Button size="sm" variant="destructive" onClick={() => onVerb(`decline_piece(${short})`)}>
          Decline
        </Button>
        <span className="text-muted-foreground text-[0.65rem] italic">
          every button here is a stub — it appends its verb to the board&apos;s log, writes nothing
        </span>
      </div>
    </DetailSheet>
  );
}

// The history, vertically — the drawer has the height a board column doesn't.
// "not recorded" is the honest answer for the two middle stops: the schema holds
// no transition timestamps, only `updated_at`.
function JourneyTimeline({ piece, today }: { piece: Piece; today: string }) {
  const reachedIdx = TRACK.findIndex((t) => t.state === piece.state);
  const lastTouch = days(piece.updated_at, today);
  return (
    <div className="flex flex-col">
      {TRACK.map((stop, i) => {
        const reached = i <= reachedIdx;
        const current = i === reachedIdx;
        const d = reached ? stopDate(piece, stop.state) : null;
        const last = i === TRACK.length - 1;
        return (
          <div key={stop.state} className="flex gap-3">
            <div className="flex flex-col items-center">
              {reached ? (
                <Check
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0",
                    current ? "text-foreground" : "text-emerald-500"
                  )}
                />
              ) : (
                <CircleDashed aria-hidden className="text-muted-foreground/50 size-4 shrink-0" />
              )}
              {last ? null : (
                <span
                  className={cn("w-px flex-1", i < reachedIdx ? "bg-emerald-500/40" : "bg-border")}
                />
              )}
            </div>
            <div className={cn("flex flex-1 items-baseline gap-2", last ? "pb-0" : "pb-3")}>
              <span
                className={cn(
                  "text-xs font-medium",
                  reached ? "" : "text-muted-foreground/60",
                  current && "underline decoration-dotted underline-offset-4"
                )}
              >
                {stop.label}
              </span>
              <span
                className={cn(
                  "ml-auto text-[0.7rem] tabular-nums",
                  !d
                    ? "text-muted-foreground/50"
                    : d.known
                      ? "text-muted-foreground"
                      : "text-amber-700 italic dark:text-amber-400"
                )}
              >
                {d ? d.text : "—"}
              </span>
            </div>
          </div>
        );
      })}
      <p className="text-muted-foreground mt-1 flex items-center gap-1 text-[0.7rem]">
        <Clock aria-hidden className="size-3" />
        last touched {lastTouch}d ago
        <span className="italic opacity-70">(any field, not a transition)</span>
      </p>
    </div>
  );
}
