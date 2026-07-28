import {
  Archive,
  CalendarClock,
  CalendarDays,
  Check,
  CircleDot,
  Clock,
  Lightbulb,
  Mic,
  Newspaper,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type {
  Cadence,
  CalendarItem,
  EngagementOutcome,
  FlagSide,
  IdeaWithProvenance,
  PieceChannel,
  PieceState,
  PieceWithBlocker,
  Talk,
  TalkState,
} from "@/lib/pipeline";
import { cn } from "@/lib/utils";

// ── formatting ────────────────────────────────────────────────────────────────
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dateFmt.format(d);
}

// Whole days since the capture date — the raw idle age (#76). Drives both the card's
// cue and the triage "candidate" test (idle ≥ N days, #77). Null on an unparseable date.
export function idleDays(iso: string): number | null {
  const from = new Date(iso);
  if (Number.isNaN(from.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - from.getTime()) / 86_400_000));
}

// "idle N mo" from the capture date — how long a spark has sat untouched (#76).
// Under a month it reads in days so a fresh spark doesn't collapse to "idle 0 mo";
// months are floored 30-day buckets (a rough cue, not a precise date).
export function idleLabel(iso: string): string | null {
  const days = idleDays(iso);
  if (days === null) return null;
  if (days < 30) return `idle ${days}d`;
  return `idle ${Math.floor(days / 30)} mo`;
}

// ── badges ────────────────────────────────────────────────────────────────────
// Anything renderable as a type glyph — a lucide icon or the inline LinkedIn mark.
type BadgeIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

// lucide has no brand marks, so the LinkedIn "in" glyph lives inline (filled,
// currentColor). The Badge forces svg children to size-3; standalone it takes size-*.
function LinkedinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <title>LinkedIn</title>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  );
}

// LinkedIn wears its own mark; the blog is the Flagship article (Newspaper).
const CHANNEL_META: Record<PieceChannel, { label: string; icon: BadgeIcon }> = {
  blog: { label: "Blog", icon: Newspaper },
  linkedin: { label: "LinkedIn", icon: LinkedinIcon },
};

export function ChannelBadge({ channel }: { channel: PieceChannel }) {
  const { label, icon: Icon } = CHANNEL_META[channel];
  return (
    <Badge variant="outline" className="gap-1">
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

// The Calendar's by-date items carry a kind (piece/cfp/event); a piece's `detail`
// is its channel. One place maps a kind to icon + label + badge tone, shared by the
// agenda (badge) and the Overview "Next up" list (bare icon).
export function calendarKindMeta(item: CalendarItem): {
  icon: BadgeIcon;
  label: string;
  variant: "outline" | "secondary" | "destructive";
} {
  if (item.kind === "cfp")
    return { icon: CalendarClock, label: "CFP deadline", variant: "destructive" };
  if (item.kind === "event") return { icon: Mic, label: "Event", variant: "secondary" };
  const meta = CHANNEL_META[item.detail as PieceChannel] ?? CHANNEL_META.blog;
  return { icon: meta.icon, label: meta.label, variant: "outline" };
}

// The kind as a bare icon, labelled for screen readers + hover — the compact cue
// used where a full badge would be too heavy (the Overview "Next up" list).
export function CalendarKindIcon({ item }: { item: CalendarItem }) {
  const { icon: Icon, label } = calendarKindMeta(item);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="text-muted-foreground inline-flex shrink-0"
    >
      <Icon aria-hidden className="size-4" />
    </span>
  );
}

export function FlagBadge({ flagSide }: { flagSide: FlagSide }) {
  return flagSide === "flag" ? (
    <Badge className="uppercase tracking-wide">Flag</Badge>
  ) : (
    <Badge variant="secondary" className="uppercase tracking-wide">
      Side
    </Badge>
  );
}

// State → dot colour. Kept semantic and quiet; the neutral theme carries the rest.
// `ready` is a Piece state (ADR-0018) and a Talk state; `in_production` is now
// Talk-only. Each state gets a distinct hue so the board reads at a glance.
const STATE_DOT: Record<PieceState | TalkState, string> = {
  proposed: "text-amber-500",
  slotted: "text-sky-500",
  ready: "text-teal-500",
  in_production: "text-violet-500",
  published: "text-emerald-500",
  declined: "text-muted-foreground",
};

export function StateBadge({ state }: { state: PieceState | TalkState }) {
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <CircleDot aria-hidden className={cn(STATE_DOT[state])} />
      {state.replace("_", " ")}
    </Badge>
  );
}

// An Engagement's outcome — the *submission's* state, which is not the Talk's
// readiness: a CFP can read `accepted` while the slides are not written. Both show
// on an Engagement, side by side, so neither can be mistaken for the other.
const OUTCOME_DOT: Record<EngagementOutcome, string> = {
  to_submit: "text-amber-500",
  submitted: "text-sky-500",
  accepted: "text-emerald-500",
  rejected: "text-muted-foreground",
  confirmed: "text-violet-500",
};

export function OutcomeBadge({ outcome }: { outcome: EngagementOutcome }) {
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <CircleDot aria-hidden className={cn(OUTCOME_DOT[outcome])} />
      {outcome.replace("_", " ")}
    </Badge>
  );
}

// ── cards ─────────────────────────────────────────────────────────────────────
// Takes a `PieceWithBlocker`, not a bare `Piece`: the blocked-by cue is only legible
// with the blocking Piece's title, so the type is what keeps a caller from rendering
// four characters of an id again (#111). It falls back to the id only when the
// blocker itself could not be resolved.
export function PieceCard({ piece }: { piece: PieceWithBlocker }) {
  const date = formatDate(piece.publish_date);
  return (
    <Card className="gap-3 p-4">
      <p className="text-sm leading-snug font-medium text-pretty">{piece.title}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <StateBadge state={piece.state} />
        <ChannelBadge channel={piece.channel} />
        <FlagBadge flagSide={piece.flag_side} />
      </div>
      <div className="text-muted-foreground flex flex-col gap-1 text-xs">
        <span className="flex items-center gap-1.5">
          <CalendarDays aria-hidden className="size-3.5 shrink-0" />
          {date ?? <span className="italic">no date</span>}
        </span>
        {/* Its own line, so a blocker's title has the card's width to read in. */}
        {piece.blocked_by_piece_id ? (
          <span className="truncate pl-5">
            blocked by {piece.blockedByTitle ?? piece.blocked_by_piece_id.slice(-4)}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export function TalkCard({ talk }: { talk: Talk }) {
  return (
    <Card className="gap-3 p-4">
      <p className="text-sm leading-snug font-medium text-pretty">{talk.title}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <StateBadge state={talk.state} />
        <Badge variant="outline" className="gap-1">
          <Mic aria-hidden />
          Talk
        </Badge>
        <FlagBadge flagSide={talk.flag_side} />
      </div>
    </Card>
  );
}

// used N× / never used — has this spark already become output? (#76). Reused by
// the Ideas card and the detail drawer's provenance header.
export function UsedBadge({ count }: { count: number }) {
  return count > 0 ? (
    <Badge variant="secondary" className="font-normal tabular-nums">
      used {count}×
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground font-normal">
      never used
    </Badge>
  );
}

export function IdeaCard({ idea }: { idea: IdeaWithProvenance }) {
  // The title is a summary; fall back to the verbatim spark.
  const headline = idea.title?.trim() || idea.body;
  const idle = idleLabel(idea.created_at);
  return (
    <Card className="h-full gap-2 p-4">
      <div className="flex gap-2">
        <Lightbulb aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <p className="text-sm leading-snug text-pretty line-clamp-3">{headline}</p>
      </div>
      {/* Provenance + age + source — the triage cues (#76). */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6">
        {idea.status === "archived" ? (
          <Badge variant="outline" className="text-muted-foreground gap-1 font-normal">
            <Archive aria-hidden className="size-3" />
            archived
          </Badge>
        ) : null}
        <UsedBadge count={idea.usedCount} />
        {idle ? (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-[0.7rem] tabular-nums">
            <Clock aria-hidden className="size-3" />
            {idle}
          </span>
        ) : null}
        {idea.source ? (
          <span className="text-muted-foreground text-[0.7rem] uppercase tracking-wide">
            {idea.source}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

// ── cadence strip ───────────────────────────────────────────────────────────────
function CadencePill({ label, covered }: { label: string; covered: boolean }) {
  const Icon = covered ? Check : TriangleAlert;
  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2.5",
        covered
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <div className="flex flex-col leading-tight">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[0.7rem] opacity-80">{covered ? "covered" : "open"}</span>
      </div>
    </div>
  );
}

export function CadenceStrip({ cadence }: { cadence: Cadence }) {
  return (
    <div className="flex gap-2">
      <CadencePill label="LinkedIn / week" covered={cadence.linkedin_week_covered} />
      <CadencePill label="Blog / month" covered={cadence.blog_month_covered} />
    </div>
  );
}

// ── layout helpers ──────────────────────────────────────────────────────────────
export function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-baseline gap-2 px-1 text-sm font-semibold tracking-tight">
        {title}
        {count !== undefined ? (
          <span className="text-muted-foreground text-xs font-normal">{count}</span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-xs">
      {children}
    </p>
  );
}
