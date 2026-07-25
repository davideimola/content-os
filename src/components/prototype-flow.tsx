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
//
// Every "stuck" rule here is a *candidate* — it must agree with the fourth-Beat
// signal set (#88) if it survives. The point is to react to concrete flags.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ArrowRight,
  Ban,
  Bot,
  Check,
  ChevronDown,
  CircleDashed,
  Clock,
  Eye,
  EyeOff,
  Hand,
  HelpCircle,
  TriangleAlert,
} from "lucide-react";

import { ChannelBadge, FlagBadge, formatDate } from "@/components/pipeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Piece, PieceState } from "@/lib/pipeline";
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
          const reachedIdx = TRACK.findIndex((t) => t.state === piece.state);
          const flags = flagsFor(piece, pieces, today);
          const lastTouch = days(piece.updated_at, today);
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

              {/* The track. Horizontal on desktop, stacked on mobile. */}
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
                          d?.known
                            ? "text-muted-foreground"
                            : "text-amber-700 italic dark:text-amber-400"
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
