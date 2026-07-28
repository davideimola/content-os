import type { ThemeGraph, ThemeNode } from "@/lib/derive";
import { cn } from "@/lib/utils";

// The theme concept map and the scoreboard beside it (#120) — the shape of the
// positioning: which subjects bridge and which stand alone, over the **output**.
//
// Three rules the drawing keeps, all of them constraints rather than taste:
//
//  1. **Deterministic.** A fixed ellipse layout, no force simulation and no random
//     seed, so the same input draws the identical picture on every render. A picture
//     that moves between reloads cannot be argued about — and this one is meant to be
//     argued about.
//  2. **Node size is magnitude; identity is the label, never colour.** One hue does
//     the whole job, so the map carries no categorical palette to mistake for meaning
//     and nothing depends on distinguishing two colours.
//  3. **Nothing lives only in the picture.** Every number here is also a word in the
//     scoreboard beside it — a phone has no hover, so a `<title>` may add detail but
//     may never be the only place a fact exists (ADR-0021's responsive rule).
//
// It reports counts and never concludes from them: `accumulating` is `in > out`,
// arithmetic over two counts of record. What to write next is the Desk's (ADR-0021).

// ── the drawing ───────────────────────────────────────────────────────────────
// viewBox units, chosen so the whole figure — labels included — fits a phone: at a
// ~360px content width the scale is ~1, so an 11-unit label renders at ~11px.
const W = 360;
const H = 280;
const CX = W / 2;
const CY = 136;
const RX = 92;
const RY = 76;
const LH = 11; // label line height
const R_MIN = 6; // radius of a Theme with no output at all
const R_SPAN = 11; // …plus this much at the largest

// Two decimals everywhere: the geometry is pure integer arithmetic, so this is not
// about precision but about the emitted markup being byte-stable across renders.
const n2 = (x: number) => x.toFixed(2);

type Placed = { node: ThemeNode; x: number; y: number; angle: number; r: number };

// Clockwise from the top, in node order (Pieces desc, then label) — so the heaviest
// subjects always land in the same places and the picture is recognisable between
// visits rather than merely stable within one.
function place(nodes: ThemeNode[]): Placed[] {
  const maxPieces = Math.max(1, ...nodes.map((x) => x.pieces));
  return nodes.map((node, i) => {
    const angle = -Math.PI / 2 + (i / nodes.length) * Math.PI * 2;
    return {
      node,
      x: CX + RX * Math.cos(angle),
      y: CY + RY * Math.sin(angle),
      angle,
      // sqrt so the AREA is proportional to the count, not the radius.
      r: R_MIN + R_SPAN * Math.sqrt(node.pieces / maxPieces),
    };
  });
}

// The label block sits OUTSIDE its mark, measured from the circle's edge: sideways
// where the ring has width to spare, above/below only at the top and bottom of it.
// A long label breaks before its last word rather than overflowing the viewBox.
function labelLines(label: string): string[] {
  const words = label.split(" ");
  if (label.length <= 13 || words.length < 2) return [label];
  return [words.slice(0, -1).join(" "), words[words.length - 1]];
}

export function ThemeMap({ graph }: { graph: ThemeGraph }) {
  const { nodes, edges } = graph;
  const placed = place(nodes);
  const byId = new Map(placed.map((p) => [p.node.id, p]));
  const maxWeight = Math.max(1, ...edges.map((e) => e.weight));
  const isolated = new Set(nodes.map((x) => x.id));
  for (const e of edges) {
    isolated.delete(e.a);
    isolated.delete(e.b);
  }

  return (
    <figure className="mx-auto flex w-full max-w-lg flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Theme map: ${nodes.length} Themes, ${edges.length} pairs sharing an output, ${isolated.size} sharing none.`}
      >
        <title>
          Themes as marks sized by the Pieces carrying them; a line joins two Themes that appear on
          the same output, thicker the more outputs they share.
        </title>

        {/* Edges first, recessive, behind the marks. Thickness AND opacity both track
            the weight, so the heaviest pair reads as heaviest without relying on a
            hue and without a legend to decode. */}
        <g className="text-muted-foreground">
          {edges.map((edge) => {
            const a = byId.get(edge.a);
            const b = byId.get(edge.b);
            if (!a || !b) return null;
            const scale = edge.weight / maxWeight;
            return (
              <line
                key={`${edge.a}-${edge.b}`}
                x1={n2(a.x)}
                y1={n2(a.y)}
                x2={n2(b.x)}
                y2={n2(b.y)}
                stroke="currentColor"
                strokeOpacity={n2(0.25 + 0.5 * scale)}
                strokeWidth={n2(1 + 2.5 * scale)}
                strokeLinecap="round"
              >
                <title>{`${edge.aLabel} × ${edge.bLabel} — ${edge.weight} shared output${edge.weight === 1 ? "" : "s"}`}</title>
              </line>
            );
          })}
        </g>

        <g className="text-sky-600 dark:text-sky-400">
          {placed.map(({ node, x, y, angle, r }) => {
            const alone = isolated.has(node.id);
            const lines = labelLines(node.label);
            const rows = lines.length + 1; // + the counts line
            const sideways = Math.abs(Math.cos(angle)) >= 0.5;
            const right = Math.cos(angle) > 0;
            const below = Math.sin(angle) > 0;
            const lx = sideways ? x + (right ? r + 8 : -(r + 8)) : x;
            const firstY = sideways
              ? y - (LH * (rows - 1)) / 2
              : below
                ? y + r + 15
                : y - r - 8 - LH * (rows - 1);
            const anchor = sideways ? (right ? "start" : "end") : "middle";

            return (
              <g key={node.id}>
                {/* A surface-coloured ring keeps overlapping marks legible. An
                    isolated Theme is drawn hollow with a dashed edge as well as
                    having nothing meet it — the picture says it twice, and the
                    scoreboard says it in words. */}
                <circle
                  cx={n2(x)}
                  cy={n2(y)}
                  r={n2(r)}
                  fill="currentColor"
                  fillOpacity={alone ? 0.2 : 0.85}
                  stroke="var(--background)"
                  strokeWidth={2}
                >
                  <title>{`${node.label} — ${node.pieces} Pieces out, ${node.ideas} live Ideas in, ${node.flag} flag / ${node.side} side${alone ? ", shares no output with another Theme" : ""}`}</title>
                </circle>
                {alone ? (
                  <circle
                    cx={n2(x)}
                    cy={n2(y)}
                    r={n2(r)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.25}
                    strokeDasharray="3 2.5"
                    aria-hidden
                  />
                ) : null}
                <text
                  x={n2(lx)}
                  y={n2(firstY)}
                  textAnchor={anchor}
                  className="fill-foreground text-[11px]"
                >
                  {lines.map((line, i) => (
                    <tspan key={line} x={n2(lx)} dy={i === 0 ? 0 : LH}>
                      {line}
                    </tspan>
                  ))}
                  <tspan
                    x={n2(lx)}
                    dy={LH}
                    className="fill-muted-foreground text-[9.5px] tabular-nums"
                  >
                    {node.pieces} out · {node.ideas} in
                  </tspan>
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <figcaption className="text-muted-foreground flex flex-col gap-1 text-xs">
        <span>
          Mark size = Pieces carrying the Theme · line thickness = outputs two Themes share · dashed
          = shares no output with another Theme.
        </span>
        {/* Every line's weight as a NUMBER, not only as a thickness and a hover: the
            phone is the deciding test for this drawing (ADR-0021 dec.3) and a phone has
            no hover, so the heaviest pair has to be readable as a figure too. Sorted by
            weight, which is the order the graph is built in. */}
        {edges.length > 0 ? (
          <span>
            Sharing an output:{" "}
            {edges.slice(0, PAIRS_SHOWN).map((edge, i) => (
              <span key={`${edge.a}-${edge.b}`}>
                {i > 0 ? " · " : ""}
                <span className="text-foreground">
                  {edge.aLabel} × {edge.bLabel}
                </span>{" "}
                <span className="tabular-nums">{edge.weight}</span>
              </span>
            ))}
            {edges.length > PAIRS_SHOWN ? ` · ${edges.length - PAIRS_SHOWN} more pairs` : ""}
          </span>
        ) : (
          <span>No output carries two Themes.</span>
        )}
      </figcaption>
    </figure>
  );
}

// Enough for the shape of the positioning to read; more than this and the line stops
// being a sentence.
const PAIRS_SHOWN = 6;

// ── the scoreboard ────────────────────────────────────────────────────────────
// What the old "By theme" table showed, as bars: six rows of small integers cannot be
// compared by eye, and comparing subjects is the whole question. Ideas **in** against
// Pieces **out**, the Flag/Side split, and the two marks the map draws — accumulating
// (more in than out) and isolated (shares no output) — as words.
const FILL_OUT = "bg-sky-600 dark:bg-sky-400";
const FILL_IN = "bg-muted-foreground/45";

function Bar({
  word,
  value,
  max,
  className,
  title,
}: {
  word: string;
  value: number;
  max: number;
  className: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2" title={title}>
      {/* The bar carries its own word, so no row depends on a header being on screen
          — which is what lets the same row read on a phone at a different density. */}
      <span className="text-muted-foreground w-6 shrink-0 text-[0.65rem]">{word}</span>
      <div className="bg-muted h-2 min-w-0 flex-1 overflow-hidden rounded-sm">
        <div
          className={cn("h-full rounded-r-sm", className)}
          style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
        />
      </div>
      <span className="w-5 shrink-0 text-right text-[0.7rem] tabular-nums">{value}</span>
    </div>
  );
}

export function ThemeScoreboard({
  graph,
  degree,
}: {
  graph: ThemeGraph;
  degree: Record<string, number>;
}) {
  const maxIn = Math.max(1, ...graph.nodes.map((x) => x.ideas));
  const maxOut = Math.max(1, ...graph.nodes.map((x) => x.pieces));

  return (
    <div className="flex flex-col gap-3">
      {graph.nodes.map((node) => (
        <div
          key={node.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs" title={node.label}>
              {node.label}
            </span>
            <span className="flex flex-wrap gap-x-2 text-[0.65rem]">
              {/* Deliberately NOT in the warning amber the completeness cues use: the
                  comparison is a fact (more in than out), and painting it as a defect
                  would be the console saying a subject is under-shipped — which
                  ADR-0021 keeps in the Desk, by name, in its accepted costs. */}
              {node.accumulating ? (
                <span
                  className="text-foreground"
                  title={`${node.ideas} Ideas in against ${node.pieces} Pieces out`}
                >
                  accumulating
                </span>
              ) : null}
              {degree[node.id] === 0 ? (
                <span className="text-muted-foreground" title="No output carries it with another">
                  isolated
                </span>
              ) : null}
              {node.archived ? (
                <span className="text-muted-foreground" title="Retired from the vocabulary">
                  retired
                </span>
              ) : null}
            </span>
          </span>
          {/* Flag/Side sits second on a phone (beside the label) and last on a wide
              row, after the two bars — same facts, same order of importance. */}
          <span className="text-muted-foreground shrink-0 text-right text-[0.7rem] tabular-nums sm:order-1">
            {node.flag} flag · {node.side} side
          </span>
          <div className="col-span-2 sm:col-span-1">
            <Bar
              word="in"
              value={node.ideas}
              max={maxIn}
              className={FILL_IN}
              title={`${node.ideas} live Ideas carry ${node.label}`}
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Bar
              word="out"
              value={node.pieces}
              max={maxOut}
              className={FILL_OUT}
              title={`${node.pieces} Pieces carry ${node.label}`}
            />
          </div>
        </div>
      ))}
      {/* The denominator, stated: `out` is counted over Pieces — never over Ideas — and
          declined Pieces are not output. It deliberately does not claim to be the same
          count as the `flag_mix` view, which spans Talks too and does not filter state. */}
      <p className="text-muted-foreground text-xs">
        <span className="font-medium">in</span> = live Ideas carrying the Theme ·{" "}
        <span className="font-medium">out</span> = Pieces carrying it, declined excluded ·
        accumulating = more in than out. Counted over Pieces, not over Ideas.
      </p>
    </div>
  );
}
