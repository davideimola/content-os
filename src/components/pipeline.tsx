import {
  CalendarDays,
  Check,
  CircleDot,
  FileText,
  Lightbulb,
  type LucideIcon,
  Megaphone,
  Mic,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type {
  Cadence,
  FlagSide,
  Idea,
  Piece,
  PieceChannel,
  PieceState,
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

// ── badges ────────────────────────────────────────────────────────────────────
// lucide dropped brand icons; Megaphone also fits the domain model — LinkedIn is
// the Amplifier "where content earns reach" (CONTEXT.md).
const CHANNEL_META: Record<PieceChannel, { label: string; icon: LucideIcon }> = {
  blog: { label: "Blog", icon: FileText },
  linkedin: { label: "LinkedIn", icon: Megaphone },
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

// ── cards ─────────────────────────────────────────────────────────────────────
export function PieceCard({ piece }: { piece: Piece }) {
  const date = formatDate(piece.publish_date);
  return (
    <Card className="gap-3 p-4">
      <p className="text-sm leading-snug font-medium text-pretty">{piece.title}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <StateBadge state={piece.state} />
        <ChannelBadge channel={piece.channel} />
        <FlagBadge flagSide={piece.flag_side} />
      </div>
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <CalendarDays aria-hidden className="size-3.5" />
        {date ?? <span className="italic">no date</span>}
        {piece.blocked_by_piece_id ? (
          <span className="ml-auto">blocked by {piece.blocked_by_piece_id.slice(-4)}</span>
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

export function IdeaCard({ idea }: { idea: Idea }) {
  // The title is a summary; fall back to the verbatim spark.
  const headline = idea.title?.trim() || idea.body;
  return (
    <Card className="gap-2 p-4">
      <div className="flex gap-2">
        <Lightbulb aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <p className="text-sm leading-snug text-pretty line-clamp-3">{headline}</p>
      </div>
      {idea.source ? (
        <span className="text-muted-foreground pl-6 text-[0.7rem] uppercase tracking-wide">
          {idea.source}
        </span>
      ) : null}
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
