import { Card } from "@/components/ui/card";
import { type MonthOutput, monthLabel, monthTick, type WrittenVsDated } from "@/lib/derive";
import type { FlagMix } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

// "What am I producing" — three panels of pure arithmetic over the Pipeline: how
// much went out per month against how much is merely dated, the Flag/Side mix
// against a target the console renders but does not own (ADR-0021), and how much of
// what is dated is actually written. No panel ranks anything or suggests anything.
//
// All three are dependency-free (CSS bars, like `TrendChart` is inline SVG) and
// share one visual grammar with the metric tiles: a muted label, one headline
// figure, the mark, then the numbers as words underneath — so the numbers survive
// without colour, and the panel reads on a phone.

// ── panel chrome ──────────────────────────────────────────────────────────────
function PanelHead({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-lg font-semibold tabular-nums tracking-tight">{value}</span>
    </div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground text-[0.65rem] tabular-nums">{children}</span>;
}

// A two-series legend: identity is never colour alone, so each swatch is labelled.
function Legend({ items }: { items: { className: string; label: string }[] }) {
  return (
    <span className="text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.65rem]">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          <span className={cn("size-2 rounded-sm", i.className)} />
          {i.label}
        </span>
      ))}
    </span>
  );
}

// One hue in two ordered steps, plus the neutral remainder. Named by WEIGHT, not by
// what they happen to mean in one panel: the strong step is "shipped" on the output
// chart and "flag" on the mix bar, and a name that said `SHIPPED` would lie at the
// second call site.
const FILL_STRONG = "bg-sky-600 dark:bg-sky-400";
const FILL_SOFT = "bg-sky-600/25 dark:bg-sky-400/25";
const FILL_REST = "bg-muted-foreground/30";

// ── output per month ──────────────────────────────────────────────────────────
// Magnitude over time → bars; two ordered steps of one hue, because "shipped" and
// "planned" are not two identities but two degrees of the same thing. A 2px surface
// gap separates the segments so the split is legible without a border.

export function OutputByMonth({ months }: { months: MonthOutput[] }) {
  const totalShipped = months.reduce((n, m) => n + m.shipped, 0);
  const totalPlanned = months.reduce((n, m) => n + m.planned, 0);
  const max = Math.max(1, ...months.map((m) => m.shipped + m.planned));
  const H = 72; // plot height in px — a glance, not a poster

  return (
    <Card className="gap-2.5 p-4">
      <PanelHead label="Output per month" value={`${totalShipped + totalPlanned}`} />
      <Legend
        items={[
          { className: FILL_STRONG, label: "shipped" },
          { className: FILL_SOFT, label: "planned" },
        ]}
      />
      {months.length === 0 ? (
        <p
          className="text-muted-foreground/70 flex items-center text-[0.7rem]"
          style={{ height: H }}
        >
          Nothing dated yet.
        </p>
      ) : (
        <div className="flex items-end gap-2 border-b pt-1" style={{ height: H + 1 }}>
          {months.map((m) => {
            const total = m.shipped + m.planned;
            return (
              <div
                key={m.key}
                className="flex flex-1 flex-col justify-end gap-0.5"
                style={{ height: H }}
                title={`${monthLabel(m.key)}: ${m.shipped} shipped, ${m.planned} planned`}
              >
                {m.planned > 0 ? (
                  <div
                    className={cn("mx-auto w-full max-w-8 rounded-t-sm", FILL_SOFT)}
                    style={{ height: Math.max(3, (m.planned / max) * H) }}
                  />
                ) : null}
                {m.shipped > 0 ? (
                  <div
                    className={cn(
                      "mx-auto w-full max-w-8",
                      FILL_STRONG,
                      m.planned === 0 && "rounded-t-sm"
                    )}
                    style={{ height: Math.max(3, (m.shipped / max) * H) }}
                  />
                ) : null}
                {total === 0 ? <div className="bg-muted mx-auto h-0.5 w-full max-w-8" /> : null}
              </div>
            );
          })}
        </div>
      )}
      {/* The month and its total, as text under every column: a phone has no hover,
          so no fact may live only in a `title` (ADR-0021's responsive rule). */}
      <div className="flex gap-2">
        {months.map((m) => (
          <span
            key={m.key}
            className="text-muted-foreground flex-1 text-center text-[0.6rem] leading-tight tabular-nums"
          >
            <span className="text-foreground block font-medium">{m.shipped + m.planned}</span>
            {monthTick(m.key)}
          </span>
        ))}
      </div>
      <Caption>
        {totalShipped} shipped · {totalPlanned} still only dated
      </Caption>
    </Card>
  );
}

// ── the Flag/Side mix against its ~70% target ─────────────────────────────────
// Part-to-whole with a reference mark → one bar and a tick, never a pie. The target
// is rendered and the distance to it stated; the console does not set it, tune it or
// argue about it (ADR-0021, sharpening ADR-0016 dec.2).
const FLAG_TARGET_PCT = 70;

export function FlagMixBar({ mix }: { mix: FlagMix }) {
  const pct = mix.total > 0 ? Math.round((mix.flag / mix.total) * 100) : 0;
  const gap = pct - FLAG_TARGET_PCT;

  return (
    <Card className="gap-2.5 p-4">
      <PanelHead label="Flag mix" value={`${pct}%`} />
      <Legend
        items={[
          { className: FILL_STRONG, label: "flag" },
          { className: FILL_REST, label: "side" },
        ]}
      />
      <div className="relative pt-1">
        <div className="bg-muted flex h-3 w-full gap-0.5 overflow-hidden rounded-sm">
          <div className={FILL_STRONG} style={{ width: `${pct}%` }} title={`${mix.flag} flag`} />
          <div className={cn("flex-1", FILL_REST)} title={`${mix.side} side`} />
        </div>
        {/* The ~70% target as a reference mark, not a series. */}
        <div
          aria-hidden
          className="bg-foreground absolute bottom-0 h-4 w-0.5"
          style={{ left: `${FLAG_TARGET_PCT}%` }}
          title={`target ~${FLAG_TARGET_PCT}%`}
        />
      </div>
      <Caption>
        {mix.flag} flag · {mix.side} side · target ~{FLAG_TARGET_PCT}%{" "}
        {mix.total > 0
          ? `(${gap === 0 ? "on it" : `${Math.abs(gap)} pts ${gap > 0 ? "over" : "under"}`})`
          : ""}
      </Caption>
    </Card>
  );
}

// ── written, of what is dated ─────────────────────────────────────────────────
// The blind spot the cadence pills hide, as one figure: a slot existing and the
// thing being written are two facts, and only the first one was ever on the home.
const FILL_WRITTEN = "bg-teal-600 dark:bg-teal-400";

export function WrittenVsDatedBar({ written }: { written: WrittenVsDated }) {
  const pct = written.dated > 0 ? Math.round((written.written / written.dated) * 100) : 0;
  // The remainder segment covers everything not written — including a missed date,
  // which is unwritten AND past. Its cue enumerates the same buckets the caption
  // does, so the bar and the words can never report two different numbers.
  const notWritten = written.notWritten + written.late;
  const rest = [
    `${notWritten} not written`,
    written.late > 0 ? `${written.late} of them late` : null,
    written.missed > 0 ? `${written.missed} missed` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="gap-2.5 p-4">
      <PanelHead label="Written, of what's dated" value={`${written.written}/${written.dated}`} />
      <Legend
        items={[
          { className: FILL_WRITTEN, label: "written" },
          { className: FILL_REST, label: "not written" },
        ]}
      />
      <div className="pt-1">
        <div className="bg-muted flex h-3 w-full gap-0.5 overflow-hidden rounded-sm">
          <div
            className={FILL_WRITTEN}
            style={{ width: `${pct}%` }}
            title={`${written.written} written (${written.shipped} shipped, ${written.inCan} in the can)`}
          />
          <div className={cn("flex-1", FILL_REST)} title={rest} />
        </div>
      </div>
      <Caption>
        {written.shipped} shipped · {written.inCan} in the can · {notWritten} not written
        {written.late > 0 ? (
          <span className="text-amber-700 dark:text-amber-400"> ({written.late} late)</span>
        ) : null}
        {written.missed > 0 ? (
          <span className="text-red-700 dark:text-red-400"> · {written.missed} missed</span>
        ) : null}
      </Caption>
    </Card>
  );
}
