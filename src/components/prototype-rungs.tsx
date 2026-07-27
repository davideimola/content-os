"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PROTOTYPE — THROWAWAY. Do not merge to main. (wayfinder ticket #104)
//
// Plan: three variants of the per-Piece flow timeline — #95 dec.3's four rungs
// with their sub-lines — switchable via `?variant=E|F|G` on the existing
// /pipeline route, rendered over a bench of the seven contract-permitted cases
// at the drawer's *true* width, plus the real drawer for the mobile question.
//
//   E — prose sub-lines     the #95 dec.3 sketch, taken literally
//   F — fact chips          no prose: facts as chips, one consequence footer
//   G — current rung only   reached rungs collapse into a breadcrumb
//
// Two toggles answer two of the ticket's questions without a rebuild:
//   ?verb=1     — name the verb that leaves each rung (Q4)
//   ?act=dated  — activate on a date+hour too, not only on a production fact
//                 (the reading of #95 dec.2 the ticket's own case 4 implies)
//
// #86 settled the surface (drawer, vertical timeline); #95 settled what the
// timeline has lines for. What is left is whether it *reads*.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Ban,
  Bot,
  Check,
  ChevronRight,
  CircleDashed,
  Clock,
  FileText,
  Hand,
  Image as ImageIcon,
  Ruler,
  TriangleAlert,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

import { CopyId } from "@/components/copy-id";
import { DetailSheet } from "@/components/detail/detail-sheet";
import { ChannelBadge, FlagBadge, formatDate, StateBadge } from "@/components/pipeline";
import { flagsFor } from "@/components/prototype-flow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PieceState } from "@/lib/pipeline";
import type { ProtoPiece } from "@/lib/prototype-cases";
import { cn } from "@/lib/utils";

export type TimelineMode = "prose" | "chips" | "current";
export type ActivationMode = "strict" | "dated";

// ── the ladder, and what each rung derives ───────────────────────────────────
// #95 dec.3: the rung carries the *contract's* name; what it means on this
// channel, and what is true, is the line underneath. One vocabulary, one ladder.

const RUNGS: { state: PieceState; label: string }[] = [
  { state: "proposed", label: "proposed" },
  { state: "slotted", label: "slotted" },
  { state: "ready", label: "ready" },
  { state: "published", label: "published" },
];

type RungView = {
  state: PieceState;
  label: string;
  reached: boolean;
  current: boolean;
  /** the right-hand column: the only dates the contract actually holds */
  when: string | null;
  whenNote: string | null;
  /** the channel's meaning + what is live — only ever on the current rung */
  facts: string[];
  consequence: string | null;
  /** the verb that leaves this rung (Q4 — the `Move` section already names it) */
  verb: string | null;
};

const assetKind = (name: string) =>
  name.endsWith(".pdf") ? "carousel uploaded" : "image uploaded";

/** #95 dec.2 — the view self-suppresses: no production fact, nothing to draw. */
export function activation(p: ProtoPiece, mode: ActivationMode): { on: boolean; why: string } {
  const production =
    p.body !== null
      ? "the copy is in HQ"
      : p.artifact_url !== null
        ? "the artifact/PR exists"
        : p.state === "published"
          ? "it is published"
          : null;
  if (production) return { on: true, why: `activated — ${production}` };
  if (mode === "dated" && p.publish_date)
    return { on: true, why: "activated — it has a date (the looser reading of dec.2)" };
  return {
    on: false,
    why:
      mode === "dated"
        ? "suppressed — no production fact and no date"
        : "suppressed — no production fact (strict #95 dec.2)",
  };
}

function currentFacts(p: ProtoPiece): { facts: string[]; consequence: string | null } {
  switch (p.state) {
    case "proposed":
      return p.body
        ? {
            facts: ["copy in HQ", "no date yet"],
            consequence: "nothing will ship it until it is slotted",
          }
        : { facts: [], consequence: null };
    case "slotted":
      return p.channel === "blog"
        ? { facts: ["nothing written yet"], consequence: "nothing to merge" }
        : { facts: ["nothing written yet"], consequence: "the cron has nothing to send" };
    case "ready": {
      if (p.channel === "blog")
        return { facts: ["PR open, unmerged"], consequence: "the merge publishes it" };
      const facts = ["copy in HQ", p.asset_name ? assetKind(p.asset_name) : "text-only, no asset"];
      if (p.manual) facts.push("“I’ll send it myself”");
      return {
        facts,
        consequence: p.manual
          ? "the cron will not fire; only the ship Beat pings"
          : `goes out at ${String(p.publish_hour ?? 11).padStart(2, "0")}:00`,
      };
    }
    case "published":
      return {
        facts: p.manual
          ? ["sent by hand"]
          : p.channel === "linkedin"
            ? ["sent by the publisher"]
            : ["merged"],
        consequence: null,
      };
    default:
      return { facts: [], consequence: null };
  }
}

function verbLeaving(p: ProtoPiece, state: PieceState): string | null {
  switch (state) {
    case "proposed":
      return "slot_piece";
    case "slotted":
      return p.channel === "blog" ? "set_piece_artifact" : "promote (copy + asset — #93 names it)";
    case "ready":
      return p.channel === "blog"
        ? "publish_piece ← the merge"
        : "set_piece_linkedin_url ← the post URL";
    default:
      return null;
  }
}

export function rungViews(p: ProtoPiece): RungView[] {
  const idx = RUNGS.findIndex((r) => r.state === p.state);
  const live = currentFacts(p);
  const hour = p.publish_hour != null ? `, ${String(p.publish_hour).padStart(2, "0")}:00` : "";

  return RUNGS.map((r, i) => {
    const reached = idx >= 0 && i <= idx;
    const current = i === idx;
    let when: string | null = null;
    let whenNote: string | null = null;
    if (reached) {
      // The right-hand column holds two different KINDS of quantity, and the
      // prototype labels which is which rather than hiding it — because on every
      // healthy `ready` Piece the ladder reads backwards (see the bench footer).
      if (r.state === "proposed") when = formatDate(p.created_at) ?? null;
      if (r.state === "slotted" && p.publish_date) {
        when = `${formatDate(p.publish_date)}${hour}`;
        // `publish_date` is the *intent* while slotted, and #87 overwrites it with
        // the fact on publish — so the label is only true before publication.
        whenNote = p.state === "published" ? null : "planned";
      }
      if (r.state === "ready" && p.ready_at) {
        when = formatDate(p.ready_at) ?? null;
        whenNote = "event log";
      }
      if (r.state === "published" && p.publish_date) when = formatDate(p.publish_date) ?? null;
    }
    return {
      state: r.state,
      label: r.label,
      reached,
      current,
      when,
      whenNote,
      facts: current ? live.facts : [],
      consequence: current ? live.consequence : null,
      verb: verbLeaving(p, r.state),
    };
  });
}

/** Q3, as a number rather than a feeling: how long the sub-line actually is. */
export function subLineLength(v: RungView): number {
  return [v.facts.join(" · "), v.consequence ? `→ ${v.consequence}` : ""].filter(Boolean).join(" ")
    .length;
}

// ── the "nothing to draw" state (case 6 — must look deliberate) ───────────────

function Suppressed({ why }: { why: string }) {
  return (
    <p className="text-muted-foreground flex items-start gap-1.5 rounded-md border border-dashed px-2.5 py-2 text-[0.7rem] leading-snug">
      <CircleDashed aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span>
        Nothing in production yet — the flow appears with the first fact.
        <span className="block opacity-70 italic">{why}</span>
      </span>
    </p>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// E — prose sub-lines. #95 dec.3's sketch, literal: rung, date on the right,
// the channel's meaning and the live facts as one prose line underneath, the
// consequence as a second, arrowed line.
// ═════════════════════════════════════════════════════════════════════════════

export function TimelineProse({
  piece,
  showVerb,
  act,
}: {
  piece: ProtoPiece;
  showVerb: boolean;
  act: ActivationMode;
}) {
  const a = activation(piece, act);
  if (!a.on) return <Suppressed why={a.why} />;
  const views = rungViews(piece);

  return (
    <div className="flex flex-col">
      {views.map((v, i) => {
        const last = i === views.length - 1;
        const hasSub = v.facts.length > 0 || v.consequence !== null;
        return (
          <div key={v.state} className="flex gap-2.5">
            <Rail
              reached={v.reached}
              current={v.current}
              passed={v.reached && !v.current}
              last={last}
            />
            <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", last ? "pb-0" : "pb-3")}>
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "text-xs font-medium",
                    v.reached ? "" : "text-muted-foreground/50",
                    v.current && "underline decoration-dotted underline-offset-4"
                  )}
                >
                  {v.label}
                </span>
                <span className="text-muted-foreground ml-auto shrink-0 text-[0.7rem] tabular-nums">
                  {v.when ?? (v.reached ? "—" : "")}
                  {v.whenNote ? <em className="ml-1 opacity-60">{v.whenNote}</em> : null}
                </span>
              </div>
              {hasSub ? (
                <div className="flex flex-col gap-0.5">
                  {v.facts.length > 0 ? (
                    <p className="text-muted-foreground text-[0.7rem] leading-snug text-pretty">
                      {piece.channel} · {v.facts.join(" · ")}
                    </p>
                  ) : null}
                  {v.consequence ? (
                    <p className="text-[0.7rem] leading-snug text-pretty">
                      <span className="text-muted-foreground/70">→ </span>
                      {v.consequence}
                      {showVerb && v.verb ? (
                        <code className="text-muted-foreground/70 ml-1.5 text-[0.65rem]">
                          {v.verb}
                        </code>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Rail({
  reached,
  current,
  passed,
  last,
}: {
  reached: boolean;
  current: boolean;
  passed: boolean;
  last: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      {reached ? (
        current ? (
          <span className="bg-foreground mt-0.5 size-3.5 shrink-0 rounded-full ring-2 ring-offset-1 ring-foreground/25 ring-offset-transparent" />
        ) : (
          <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
        )
      ) : (
        <CircleDashed aria-hidden className="text-muted-foreground/40 mt-0.5 size-3.5 shrink-0" />
      )}
      {last ? null : (
        <span className={cn("mt-0.5 w-px flex-1", passed ? "bg-emerald-500/40" : "bg-border")} />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// F — fact chips. No prose in the ladder: the facts become chips on the rung,
// and the consequence is lifted *out* of the ladder into one footer — because
// there is only ever one current rung, so the consequence belongs to the Piece.
// ═════════════════════════════════════════════════════════════════════════════

export function TimelineChips({
  piece,
  showVerb,
  act,
}: {
  piece: ProtoPiece;
  showVerb: boolean;
  act: ActivationMode;
}) {
  const a = activation(piece, act);
  if (!a.on) return <Suppressed why={a.why} />;
  const views = rungViews(piece);
  const current = views.find((v) => v.current);

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1">
        {views.map((v) => (
          <li
            key={v.state}
            className={cn(
              "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5",
              v.current ? "bg-muted border-border border" : "border border-transparent"
            )}
          >
            {v.reached ? (
              v.current ? (
                <span className="bg-foreground size-2 shrink-0 rounded-full" />
              ) : (
                <Check aria-hidden className="size-3 shrink-0 text-emerald-500" />
              )
            ) : (
              <CircleDashed aria-hidden className="text-muted-foreground/40 size-3 shrink-0" />
            )}
            <span
              className={cn("text-xs font-medium", v.reached ? "" : "text-muted-foreground/50")}
            >
              {v.label}
            </span>
            {v.facts.map((f) => (
              <Badge key={f} variant="secondary" className="px-1.5 py-0 text-[0.65rem] font-normal">
                {f}
              </Badge>
            ))}
            <span className="text-muted-foreground ml-auto shrink-0 text-[0.7rem] tabular-nums">
              {v.when ?? (v.reached ? "—" : "")}
              {v.whenNote ? <em className="ml-1 opacity-60">{v.whenNote}</em> : null}
            </span>
          </li>
        ))}
      </ol>
      {current?.consequence ? (
        <p className="flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[0.7rem] leading-snug">
          {piece.manual ? (
            <Hand aria-hidden className="mt-0.5 size-3 shrink-0" />
          ) : (
            <Bot aria-hidden className="mt-0.5 size-3 shrink-0" />
          )}
          <span>
            <span className="text-muted-foreground">Next: </span>
            {current.consequence}
            {showVerb && current.verb ? (
              <code className="text-muted-foreground/70 ml-1.5 text-[0.65rem]">{current.verb}</code>
            ) : null}
          </span>
        </p>
      ) : null}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// G — current rung only. The reached rungs collapse into a breadcrumb; only the
// rung you are on gets height, because it is the only one with anything true
// inside it. Buys the drawer back three rows.
// ═════════════════════════════════════════════════════════════════════════════

export function TimelineCurrent({
  piece,
  showVerb,
  act,
}: {
  piece: ProtoPiece;
  showVerb: boolean;
  act: ActivationMode;
}) {
  const a = activation(piece, act);
  if (!a.on) return <Suppressed why={a.why} />;
  const views = rungViews(piece);
  const idx = views.findIndex((v) => v.current);
  const passed = views.slice(0, Math.max(0, idx));
  const current = views[idx];
  const ahead = views.slice(idx + 1);

  return (
    <div className="flex flex-col gap-1.5">
      {passed.length > 0 ? (
        <p className="text-muted-foreground flex flex-wrap items-center gap-1 text-[0.7rem]">
          {passed.map((v, i) => (
            <Fragment key={v.state}>
              {i > 0 ? <ChevronRight aria-hidden className="size-3 opacity-50" /> : null}
              <span>
                {v.label}
                {v.when ? <span className="ml-1 tabular-nums opacity-70">{v.when}</span> : null}
              </span>
            </Fragment>
          ))}
          <ChevronRight aria-hidden className="size-3 opacity-50" />
        </p>
      ) : null}

      {current ? (
        <div className="border-foreground/25 bg-muted/40 flex flex-col gap-1 rounded-md border px-2.5 py-2">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold">{current.label}</span>
            <span className="text-muted-foreground ml-auto text-[0.7rem] tabular-nums">
              {current.when ?? "—"}
              {current.whenNote ? <em className="ml-1 opacity-60">{current.whenNote}</em> : null}
            </span>
          </div>
          {current.facts.length > 0 ? (
            <p className="text-muted-foreground text-[0.7rem] leading-snug text-pretty">
              {piece.channel} · {current.facts.join(" · ")}
            </p>
          ) : null}
          {current.consequence ? (
            <p className="text-[0.7rem] leading-snug text-pretty">
              <span className="text-muted-foreground/70">→ </span>
              {current.consequence}
              {showVerb && current.verb ? (
                <code className="text-muted-foreground/70 ml-1.5 text-[0.65rem]">
                  {current.verb}
                </code>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {ahead.length > 0 ? (
        <p className="text-muted-foreground/60 flex flex-wrap items-center gap-1 text-[0.7rem]">
          then
          {ahead.map((v) => (
            <span key={v.state} className="italic">
              {v.label}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

const TIMELINES: Record<TimelineMode, typeof TimelineProse> = {
  prose: TimelineProse,
  chips: TimelineChips,
  current: TimelineCurrent,
};

// ═════════════════════════════════════════════════════════════════════════════
// The `declined` bench — the ticket's first open question, three candidate
// answers side by side. `declined` is the enum's fifth value and the ladder has
// four rungs, so it sits off the route entirely.
// ═════════════════════════════════════════════════════════════════════════════

/** T1 — truncated: stop where it got to. Which the contract does NOT record. */
function DeclinedTruncated({ piece }: { piece: ProtoPiece }) {
  const inferred = piece.body || piece.artifact_url ? 2 : piece.publish_date ? 1 : 0;
  return (
    <div className="flex flex-col">
      {RUNGS.slice(0, inferred + 1).map((r, i) => (
        <div key={r.state} className="flex gap-2.5">
          <Rail reached passed={true} current={false} last={false} />
          <div className="flex flex-1 items-baseline gap-2 pb-3">
            <span className="text-xs font-medium">{r.label}</span>
            {i === inferred ? (
              <span className="text-[0.65rem] text-amber-700 italic dark:text-amber-400">
                inferred from the facts — not recorded
              </span>
            ) : null}
          </div>
        </div>
      ))}
      <div className="flex gap-2.5">
        <div className="flex flex-col items-center">
          <Ban aria-hidden className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-red-400" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-medium text-red-600 dark:text-red-400">declined</span>
          <span className="text-muted-foreground text-[0.7rem]">
            {formatDate(piece.updated_at)} · kept on record so it is not re-proposed
          </span>
        </div>
      </div>
    </div>
  );
}

/** T2 — struck through: the whole route, visibly abandoned. */
function DeclinedStruck({ piece }: { piece: ProtoPiece }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[0.7rem] text-red-700 dark:text-red-400">
        <Ban aria-hidden className="size-3 shrink-0" />
        Declined {formatDate(piece.updated_at)} — it will not travel this route.
      </p>
      <ol className="flex flex-col gap-0.5 opacity-45">
        {RUNGS.map((r) => (
          <li key={r.state} className="flex items-baseline gap-2 px-0.5">
            <CircleDashed aria-hidden className="size-3 shrink-0" />
            <span className="text-xs font-medium line-through">{r.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** T3 — no flow at all: one line, and only the facts that survive it. */
function DeclinedNone({ piece }: { piece: ProtoPiece }) {
  return (
    <p className="text-muted-foreground flex items-start gap-1.5 rounded-md border border-dashed px-2.5 py-2 text-[0.7rem] leading-snug">
      <Ban aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span>
        Declined {formatDate(piece.updated_at)} — no route to show. Kept on record so it is not
        re-proposed.
        {piece.body ? <span className="block opacity-80">The copy is still on file.</span> : null}
      </span>
    </p>
  );
}

const DECLINED_TREATMENTS = [
  {
    key: "T1",
    name: "truncated ladder",
    note: "Shows where it got to — but nothing records that, so the last rung is *inferred* from the facts. A guess drawn as history.",
    render: DeclinedTruncated,
  },
  {
    key: "T2",
    name: "struck-through ladder",
    note: "Keeps the vocabulary and says “not this route”. Costs four rows to say one thing, and strike-through on a rung it never reached is a small lie too.",
    render: DeclinedStruck,
  },
  {
    key: "T3",
    name: "no flow at all",
    note: "The derived view has no facts about a route not taken, so it self-suppresses — the same rule as case 6, applied to a fifth state rather than an empty one.",
    render: DeclinedNone,
  },
] as const;

// ── the copy, as the console will hold it (#89 dec.4) ────────────────────────
// Included because Q2 asks whether the *drawer* survives, and #89 put the post
// copy in it. #102 dec.9: the console highlights which tokens go blue, sharing
// the publisher's regex — hashtags pass verbatim, the reserved fourteen escape.

const RESERVED = /[|{}@[\]()<>\\*_~]/g;
const HASHTAG = /(^|\s)(#[A-Za-z]\w*)/g;

function CopyPreview({ body }: { body: string }) {
  const [open, setOpen] = useState(false);
  const escapes = body.match(RESERVED)?.length ?? 0;
  const tags = [...body.matchAll(HASHTAG)].map((m) => m[2]);

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "bg-muted/40 rounded-md border px-2.5 py-2 text-[0.7rem] leading-relaxed whitespace-pre-wrap",
          open ? "" : "max-h-24 overflow-hidden"
        )}
      >
        {body.split(/(\s)/).map((tok, i) => {
          const isTag = /^#[A-Za-z]\w*$/.test(tok);
          const willEscape = RESERVED.test(tok);
          RESERVED.lastIndex = 0;
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: prototype, tokens are not stable ids
              key={i}
              className={cn(
                isTag && "font-medium text-sky-600 dark:text-sky-400",
                !isTag && willEscape && "bg-amber-500/15 underline decoration-dotted"
              )}
            >
              {tok}
            </span>
          );
        })}
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.65rem]">
        <button type="button" onClick={() => setOpen((o) => !o)} className="underline">
          {open ? "collapse" : "show all"}
        </button>
        <span>·</span>
        <span>
          {tags.length} hashtag{tags.length === 1 ? "" : "s"} go blue
        </span>
        <span>·</span>
        <span>{escapes} characters get escaped</span>
      </div>
    </div>
  );
}

// ── Q2, measured rather than eyeballed ───────────────────────────────────────
// Reports the drawer's content height against the viewport it is in, and where
// the `Move` section starts — "without scrolling past the actions" is a number.

function FitReadout() {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ content: number; view: number; moveTop: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scroller = el.closest<HTMLElement>(".overflow-y-auto");
    if (!scroller) return;
    const measure = () => {
      const move = scroller.querySelector<HTMLElement>("[data-fold-marker]");
      const top = move
        ? move.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop
        : 0;
      setFit({ content: scroller.scrollHeight, view: scroller.clientHeight, moveTop: top });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, []);

  const overflows = fit ? fit.content > fit.view : false;
  const moveBelowFold = fit ? fit.moveTop > fit.view : false;

  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-dashed px-2 py-1.5 text-[0.65rem]",
        moveBelowFold
          ? "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400"
          : "text-muted-foreground"
      )}
    >
      <Ruler aria-hidden className="size-3 shrink-0" />
      {fit ? (
        <>
          <span className="tabular-nums">
            content {fit.content}px / viewport {fit.view}px
          </span>
          <span>·</span>
          <span className="tabular-nums">Move starts at {Math.round(fit.moveTop)}px</span>
          <span>·</span>
          <span className="font-medium">
            {moveBelowFold
              ? "the actions are below the fold"
              : overflows
                ? "scrolls, actions visible"
                : "fits"}
          </span>
        </>
      ) : (
        <span>measuring…</span>
      )}
    </div>
  );
}

// ── the drawer, as the decided contract leaves it ────────────────────────────
// #86 collapsed ten sections into six. This adds what #89/#91/#95 put in it —
// the copy, the asset, the hour, the flow — which is exactly the pushback Q2
// asks about. `Move` carries the fold marker.

function ProtoRungDrawer({
  piece,
  mode,
  showVerb,
  act,
  open,
  onOpenChange,
}: {
  piece: ProtoPiece;
  mode: TimelineMode;
  showVerb: boolean;
  act: ActivationMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const Timeline = TIMELINES[mode];
  const flags = flagsFor(piece, [piece], new Date().toISOString().slice(0, 10));

  return (
    <DetailSheet open={open} onOpenChange={onOpenChange} title={piece.title}>
      <FitReadout />

      <div className="flex flex-wrap items-center gap-1.5">
        <StateBadge state={piece.state} />
        <ChannelBadge channel={piece.channel} />
        <FlagBadge flagSide={piece.flag_side} />
        {piece.manual ? (
          <Badge variant="outline" className="gap-1 font-normal">
            <Hand aria-hidden className="size-3" />
            manual
          </Badge>
        ) : null}
        <CopyId id={piece.id} className="ml-auto" />
      </div>

      {flags.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[0.7rem]">
          {flags.map((f) => (
            <span key={f.code}>{f.reason}</span>
          ))}
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-tight">Flow</h3>
        {piece.state === "declined" ? (
          <DeclinedNone piece={piece} />
        ) : (
          <Timeline piece={piece} showVerb={showVerb} act={act} />
        )}
      </section>

      {piece.channel === "linkedin" && piece.body ? (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-tight">
            <FileText aria-hidden className="size-3.5" />
            Copy
          </h3>
          <CopyPreview body={piece.body} />
        </section>
      ) : null}

      {piece.asset_name ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-tight">
            <ImageIcon aria-hidden className="size-3.5" />
            Asset
          </h3>
          <p className="text-muted-foreground text-[0.7rem]">
            <code>{piece.asset_name}</code> · promoted with the copy in one gesture (#95 dec.4)
          </p>
        </section>
      ) : null}

      {/* The fold marker: "without scrolling past the actions" is measured here. */}
      <section data-fold-marker className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-tight">Move</h3>
        <div className="flex flex-wrap gap-1.5">
          {RUNGS.filter((r) => r.state !== piece.state).map((r) => (
            <Button key={r.state} size="xs" variant="outline" disabled>
              {r.label}
            </Button>
          ))}
          <Button size="xs" variant="ghost" disabled>
            <Ban aria-hidden />
            decline
          </Button>
        </div>
        {piece.channel === "linkedin" ? (
          <p className="text-muted-foreground text-[0.7rem]">
            hour{" "}
            <code>
              {piece.publish_hour != null ? `${piece.publish_hour}:00` : "— required to slot"}
            </code>{" "}
            · #91
          </p>
        ) : null}
        <p className="text-muted-foreground text-[0.65rem] italic">
          stub — every control in this drawer writes nothing
        </p>
      </section>

      {piece.state === "published" && piece.channel === "linkedin" ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold tracking-tight">LinkedIn post</h3>
          <p className="text-muted-foreground text-[0.7rem]">
            {piece.linkedin_post_url ? "Linked — no metrics ingested yet." : "Not linked."}
          </p>
          {piece.metrics_gap ? (
            <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[0.7rem] text-amber-800 dark:text-amber-300">
              <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
              <span>
                This post&apos;s month was never ingested — any figure here understates it (#96).
                <em className="block opacity-80">
                  #95 dec.5 gave this warning its first home: the numbers, not the route.
                </em>
              </span>
            </p>
          ) : null}
        </section>
      ) : null}
    </DetailSheet>
  );
}

// ── the bench ────────────────────────────────────────────────────────────────
// The seven cases at the drawer's true content width (a 28rem sheet minus its
// px-4 padding ≈ 416px), so the wrapping you see is the wrapping you get.

const MODE_META: Record<TimelineMode, { key: string; name: string; pitch: string }> = {
  prose: {
    key: "E",
    name: "prose sub-lines",
    pitch:
      "#95 dec.3 taken literally: rung, date on the right, the channel's meaning and the live facts as prose underneath, the consequence arrowed below it.",
  },
  chips: {
    key: "F",
    name: "fact chips",
    pitch:
      "No prose in the ladder — the facts are chips on the rung, and the consequence is lifted out into a single footer, because only one rung is ever current.",
  },
  current: {
    key: "G",
    name: "current rung only",
    pitch:
      "The reached rungs collapse to a breadcrumb; only the rung you are on gets height. Buys the drawer back three rows — and hides the dates of the rungs behind you.",
  },
};

export function RungBench({
  cases,
  declined,
  mode,
  showVerb,
  act,
  openCase,
}: {
  cases: ProtoPiece[];
  declined: ProtoPiece[];
  mode: TimelineMode;
  showVerb: boolean;
  act: ActivationMode;
  /** `?open=<caseKey>` — deep-link straight into a drawer, so the mobile-height
   *  question can be measured without a click (and screenshotted headless). */
  openCase?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(
    openCase ? (cases.find((c) => c.caseKey === openCase)?.id ?? null) : null
  );
  const Timeline = TIMELINES[mode];
  const meta = MODE_META[mode];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs leading-relaxed">
        <strong className="text-foreground">
          {meta.key} — {meta.name}.
        </strong>{" "}
        {meta.pitch}
        <span className="mt-1 block">
          The seven situations below are the shapes the decided contract permits. Each card is{" "}
          <strong className="text-foreground">416px wide</strong> — the drawer&apos;s real content
          width — so the wrapping is truthful. <strong className="text-foreground">Open</strong>{" "}
          puts it in the actual drawer, which measures its own height against the viewport.
        </span>
        <span className="mt-1 block">
          Toggles: <code>verb</code> names the RPC verb that leaves each rung (the <em>Move</em>{" "}
          section already does) · <code>act</code> switches activation between <em>strict</em> (#95
          dec.2: a production fact) and <em>dated</em> (a date is enough).
        </span>
      </p>

      <div className="flex flex-wrap gap-3">
        {cases.map((p) => {
          const a = activation(p, act);
          const views = rungViews(p);
          const current = views.find((v) => v.current);
          const len = current ? subLineLength(current) : 0;
          return (
            <Fragment key={p.id}>
              <Card className="w-full max-w-[416px] flex-1 gap-2.5 p-3 sm:min-w-[340px]">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0 tabular-nums">
                    {p.caseKey}
                  </Badge>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-xs leading-snug font-semibold">{p.caseTitle}</span>
                    <span className="text-muted-foreground text-[0.65rem] italic">
                      expected: {p.caseExpectation}
                    </span>
                  </div>
                </div>

                <p className="text-muted-foreground truncate text-[0.7rem]">{p.title}</p>

                <div className="border-t pt-2.5">
                  <Timeline piece={p} showVerb={showVerb} act={act} />
                </div>

                <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2 text-[0.65rem]">
                  <span className={a.on ? "" : "text-amber-700 dark:text-amber-400"}>{a.why}</span>
                  {a.on && len > 0 ? (
                    <>
                      <span>·</span>
                      <span
                        className={cn(
                          "tabular-nums",
                          len > 80 && "font-semibold text-amber-700 dark:text-amber-400"
                        )}
                      >
                        sub-line {len} ch
                      </span>
                    </>
                  ) : null}
                  <Button
                    size="xs"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => setOpenId(p.id)}
                  >
                    Open drawer
                  </Button>
                </div>
              </Card>

              <ProtoRungDrawer
                piece={p}
                mode={mode}
                showVerb={showVerb}
                act={act}
                open={openId === p.id}
                onOpenChange={(o) => setOpenId(o ? p.id : null)}
              />
            </Fragment>
          );
        })}
      </div>

      {/* Q1 — the three candidate answers for `declined`, side by side. */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-tight">
            <Ban aria-hidden className="mr-1 inline size-3.5" />
            <code>declined</code> — off the route
          </h2>
          <p className="text-muted-foreground text-xs leading-relaxed">
            The enum has five values and the ladder has four rungs. Three candidate treatments, each
            against two shapes: declined out of <code>proposed</code> (no facts at all) and declined{" "}
            <em>after</em> the copy landed (facts exist, and the ladder had got somewhere).
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {DECLINED_TREATMENTS.map((t) => (
            <Card key={t.key} className="w-full max-w-[416px] flex-1 gap-3 p-3 sm:min-w-[340px]">
              <div className="flex items-baseline gap-2">
                <Badge variant="outline">{t.key}</Badge>
                <span className="text-xs font-semibold">{t.name}</span>
              </div>
              {declined.map((p) => (
                <div key={p.id} className="flex flex-col gap-1.5 border-t pt-2.5">
                  <span className="text-muted-foreground text-[0.65rem] italic">
                    {p.caseKey} — {p.caseTitle}
                  </span>
                  <t.render piece={p} />
                </div>
              ))}
              <p className="text-muted-foreground border-t pt-2 text-[0.65rem] leading-snug">
                {t.note}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-tight">
          <TriangleAlert aria-hidden className="size-3.5" />
          What the render found — the date column reads backwards
        </h2>
        <p className="text-xs leading-relaxed">
          Look at cases 1–3: <code>slotted 30 Jul</code> sits <em>above</em>{" "}
          <code>ready 26 Jul</code>. A vertical timeline promises monotonic time and this one breaks
          the promise on every healthy Piece — one that is written <em>ahead</em> of its date, which
          is exactly the discipline #88 wants.
        </p>
        <p className="text-xs leading-relaxed">
          The cause is that one column holds two different <strong>kinds</strong> of quantity: on{" "}
          <code>proposed</code> and <code>ready</code> it is an <em>observation</em> (when it
          happened), and on <code>slotted</code> it is an <em>intention</em> (
          <code>publish_date</code>, a future plan). The same family as{" "}
          <em>a wall-clock intent is not an instant</em> (#91) and{" "}
          <em>a level cannot live on a period-keyed row</em> (#98).
        </p>
        <p className="text-xs leading-relaxed">
          And <code>slotted</code> has no date of its own <em>at all</em>: <code>publish_date</code>{" "}
          is the only one it can show, and #87 <strong>overwrites</strong> that with the fact on
          publish — so on case 7 the <code>slotted</code> and <code>published</code> rungs show the
          same date twice, and the <em>planned</em> label would be a lie. The fix looks free: #95
          dec.6&apos;s event log records the <code>slotted</code> transition too.
        </p>
      </div>

      <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs leading-relaxed">
        <Clock aria-hidden className="mr-1 inline size-3" />
        Two places this prototype deviates from #95&apos;s sketch, deliberately, so they can be
        ruled rather than assumed. The sketch drew <code>proposed —</code> with no date; here it
        shows <code>created_at</code>, which <em>is</em> recorded. And <code>ready</code> carries a
        date at all only because #95 dec.6 bought the event log — before it, that rung read{" "}
        <em>not recorded</em> forever.
      </p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// H — all cards, one flat list. The other half of "tutte le card o kanban":
// no columns, one card per Piece, the flow carried *in line* on every card.
//
// This is #86's variant C put back on the table, because #104 changed its price:
// C lost on the per-row cost of the journey, and G (`?tl=current`) is three rows
// cheaper. Rendered over the LIVE Pipeline, not the seven cases, because the
// question is density — and the live shape is lopsided (see the header).
// ═════════════════════════════════════════════════════════════════════════════

const ORDER: PieceState[] = ["proposed", "slotted", "ready", "published", "declined"];

export function VariantH({
  pieces,
  mode,
  showVerb,
  act,
}: {
  pieces: ProtoPiece[];
  mode: TimelineMode;
  showVerb: boolean;
  act: ActivationMode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const Timeline = TIMELINES[mode];

  const ordered = [...pieces].sort((a, b) => {
    const d = ORDER.indexOf(a.state) - ORDER.indexOf(b.state);
    if (d !== 0) return d;
    return (a.publish_date ?? "9999").localeCompare(b.publish_date ?? "9999");
  });

  const byState = ORDER.map((s) => ({ s, n: pieces.filter((p) => p.state === s).length })).filter(
    (r) => r.n > 0
  );
  const lit = pieces.filter((p) => activation(p, act).on).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-dashed px-3 py-2.5">
        <p className="text-muted-foreground text-xs leading-relaxed">
          <strong className="text-foreground">H — all cards, one list.</strong> No columns: every
          Piece is a row, and the flow rides <em>in line</em> on each card. This is #86&apos;s
          variant C, re-priced — it lost on the per-row cost of the journey, and{" "}
          <code>?tl=current</code> is three rows cheaper than the prose ladder. Switch the treatment
          with <code>?tl=current|prose|chips</code> to feel the difference per row.
        </p>
        <p className="text-xs leading-relaxed">
          <strong>The deciding fact is the shape of the live Pipeline, not taste.</strong>{" "}
          {byState.map((r, i) => (
            <span key={r.s}>
              {i > 0 ? " · " : ""}
              <code>{r.s}</code> {r.n}
            </span>
          ))}{" "}
          — so the kanban currently draws <strong>four columns to hold one tall stack</strong>,
          while this list has no empty space at all. Against that:{" "}
          <strong>
            only {lit} of {pieces.length}
          </strong>{" "}
          Pieces have a production fact, so {pieces.length - lit} cards below carry a{" "}
          <em>nothing in production yet</em> line — which in a list is {pieces.length - lit} rows of
          it, where the kanban says the same thing for free by the card simply sitting in{" "}
          <code>slotted</code>.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {ordered.map((p) => {
          const a = activation(p, act);
          return (
            <Fragment key={p.id}>
              <Card className="gap-2 p-3">
                <button
                  type="button"
                  onClick={() => setOpenId(p.id)}
                  className="flex w-full flex-col gap-1.5 text-left"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StateBadge state={p.state} />
                    <ChannelBadge channel={p.channel} />
                    <FlagBadge flagSide={p.flag_side} />
                    <span className="text-muted-foreground ml-auto text-[0.7rem] tabular-nums">
                      {formatDate(p.publish_date) ?? "no date"}
                    </span>
                  </div>
                  <p className="text-sm leading-snug font-medium text-pretty">{p.title}</p>
                </button>
                <div className="border-t pt-2">
                  <Timeline piece={p} showVerb={showVerb} act={act} />
                </div>
                {a.on ? null : (
                  <p className="text-muted-foreground/70 text-[0.6rem] italic">{a.why}</p>
                )}
              </Card>

              <ProtoRungDrawer
                piece={p}
                mode={mode}
                showVerb={showVerb}
                act={act}
                open={openId === p.id}
                onOpenChange={(o) => setOpenId(o ? p.id : null)}
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function VariantE(props: Omit<Parameters<typeof RungBench>[0], "mode">) {
  return <RungBench {...props} mode="prose" />;
}
export function VariantF(props: Omit<Parameters<typeof RungBench>[0], "mode">) {
  return <RungBench {...props} mode="chips" />;
}
export function VariantG(props: Omit<Parameters<typeof RungBench>[0], "mode">) {
  return <RungBench {...props} mode="current" />;
}
