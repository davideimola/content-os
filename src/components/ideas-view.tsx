"use client";

// The Idea pool, as the view that **repairs** it (#118; prototype verdict: Ideas
// variant A, two bands, decided against live data).
//
// Three things the view did not do before. It never pointed at a spark worth
// rereading — one dictated by voice from a phone can land garbled, and one live Talk
// title is proof — so a **"Just captured"** band sits above the existing
// "Candidates to work", tested on age plus never-edited: two facts already on the
// record, so there is no new state and no schema change. It never showed a Theme
// outside a drawer, so the model was invisible in the view that owns it — the cards
// carry their Themes now, one with none says so, the filter chips count what they
// will actually show, and a **no-theme** chip turns the gap into a tagging queue.
// And there was no way to capture from here at all, so a spark noticed while looking
// at the pool needed another door.
//
// A client module because search, the filters and the caps are client state, and
// because each card hands its drawer an opener (#111). All the arithmetic — the
// bands, ages, the live-Theme test, the caps — lives in `src/lib/derive.ts`, where
// the two thresholds are named with the reason for their values. Nothing here ranks
// an Idea or suggests what to write (ADR-0021): the bands are facts about time, the
// counts are counts.

import { Archive, ChevronDown, ChevronUp, Search, Tag, Tags, TagX } from "lucide-react";
import { useMemo, useState } from "react";

import { CaptureIdea } from "@/components/detail/capture-idea";
import { IdeaDetail } from "@/components/detail/idea-detail";
import { EmptyState, Section } from "@/components/pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { capped, hasLiveTheme, ideaTriage, neverEdited, TUNING } from "@/lib/derive";
import type { IdeaWithProvenance, Theme } from "@/lib/pipeline";

// The theme filter's extra option: the sparks nobody has categorised. A sentinel
// rather than a theme id, because "no theme" is the absence of a value and not
// another value.
const NO_THEME = "__none__";

type UsedFilter = "all" | "used" | "never";
const USED_FILTERS: { value: UsedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "used", label: "Used" },
  { value: "never", label: "Never used" },
];

// What every card in every band needs and no band varies: the Theme vocabulary its
// drawer picks from, which Themes may not be retired, and the one "today" the ages and
// the bands are both drawn on. One type, so adding a band cannot accidentally hand its
// cards a different vocabulary or a different date.
type BandContext = { themes: Theme[]; themesInUse: string[]; today: string };

// One band of the pool: a heading carrying the TRUE count, an optional line of
// explanation, and the cards in columns. The cap hides cards, never the number —
// and it states how many are behind the click, in both directions, because a
// triage list that truncates silently reads as "that is all".
function Band({
  title,
  note,
  items,
  themes,
  themesInUse,
  today,
}: BandContext & {
  title: string;
  note?: React.ReactNode;
  items: IdeaWithProvenance[];
}) {
  const [expanded, setExpanded] = useState(false);
  const { shown, hidden } = expanded
    ? { shown: items, hidden: 0 }
    : capped(items, TUNING.ideaBandCards);

  return (
    <Section title={title} count={items.length}>
      {note ? <p className="text-muted-foreground -mt-1 text-xs">{note}</p> : null}
      {/* Equal heights only from the breakpoint the second column appears at: in a
          single column every card is its own row, so `auto-rows-fr` there would
          stretch a one-line spark to the height of the longest in the band — dead
          space on the phone, where it costs most. */}
      <div className="grid grid-cols-1 gap-3 md:auto-rows-fr md:grid-cols-2 xl:grid-cols-3">
        {shown.map((idea) => (
          <IdeaDetail
            key={idea.id}
            idea={idea}
            themes={themes}
            themesInUse={themesInUse}
            today={today}
          />
        ))}
      </div>
      {hidden > 0 ? (
        <Button
          size="xs"
          variant="ghost"
          className="text-muted-foreground -ml-2 w-fit"
          onClick={() => setExpanded(true)}
        >
          <ChevronDown />
          {hidden} more not shown
        </Button>
      ) : null}
      {expanded && items.length > TUNING.ideaBandCards ? (
        <Button
          size="xs"
          variant="ghost"
          className="text-muted-foreground -ml-2 w-fit"
          onClick={() => setExpanded(false)}
        >
          <ChevronUp />
          Show fewer
        </Button>
      ) : null}
    </Section>
  );
}

export function IdeasView({
  ideas,
  themes,
  themesInUse,
  today,
}: BandContext & { ideas: IdeaWithProvenance[] }) {
  const [query, setQuery] = useState("");
  const [used, setUsed] = useState<UsedFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [groupByTheme, setGroupByTheme] = useState(false);
  const [themeFilter, setThemeFilter] = useState<string | null>(null);

  // Only live themes are group/filter options — archived drop out (#79).
  const liveThemes = useMemo(() => themes.filter((t) => !t.archived), [themes]);
  // The active filter, normalised against the live list: a theme archived while it
  // was the active filter (allowed from the drawer, #78) stops filtering instead of
  // leaving a phantom filter with no chip to clear. The no-theme sentinel is not a
  // theme id and survives that check.
  const activeThemeId =
    themeFilter === NO_THEME
      ? NO_THEME
      : themeFilter && liveThemes.some((t) => t.id === themeFilter)
        ? themeFilter
        : null;

  // The pool after search, the used filter and the archived toggle — but **before**
  // the theme filter. This is the base the chips count over, which is what makes the
  // number Davide clicks the number of cards he then gets: counted over the whole
  // table (or ignoring the search) a chip reading `Security 6` could yield four.
  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ideas.filter((i) => {
      if (i.status === "archived" && !showArchived) return false;
      if (used === "used" && i.usedCount === 0) return false;
      if (used === "never" && i.usedCount > 0) return false;
      if (q && !`${i.title ?? ""}\n${i.body}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ideas, query, used, showArchived]);

  const themeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of liveThemes) counts[t.id] = 0;
    for (const idea of scoped) {
      for (const t of idea.themes) {
        if (t.id in counts) counts[t.id] += 1;
      }
    }
    return counts;
  }, [scoped, liveThemes]);
  const uncategorised = useMemo(() => scoped.filter((i) => !hasLiveTheme(i)).length, [scoped]);

  const filtered = useMemo(() => {
    if (activeThemeId === NO_THEME) return scoped.filter((i) => !hasLiveTheme(i));
    if (activeThemeId) return scoped.filter((i) => i.themes.some((t) => t.id === activeThemeId));
    return scoped;
  }, [scoped, activeThemeId]);

  // Flat is the default: the three triage bands, stacked, in order (#118).
  const triage = useMemo(() => ideaTriage(filtered, today), [filtered, today]);
  const freshNeverEdited = triage.justCaptured.filter(neverEdited).length;

  // "Group by theme" regroups the same pool under each live theme instead — an Idea
  // appears under **every** theme it carries, and those with no live theme fall into
  // a trailing band, so the pool stays whole under either lens.
  const themeGroups = useMemo(() => {
    const groups = liveThemes
      .map((t) => ({
        title: t.label,
        items: filtered.filter((i) => i.themes.some((x) => x.id === t.id)),
      }))
      .filter((g) => g.items.length > 0);
    const untagged = filtered.filter((i) => !hasLiveTheme(i));
    if (untagged.length > 0) groups.push({ title: "No theme", items: untagged });
    return groups;
  }, [filtered, liveThemes]);

  const band: BandContext = { themes, themesInUse, today };

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Controls: capture + search + used filter + archived toggle + group-by-theme. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sparks…"
            className="pl-8"
            aria-label="Search ideas"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CaptureIdea />
          <div className="flex items-center rounded-lg border p-0.5">
            {USED_FILTERS.map((f) => (
              <Button
                key={f.value}
                size="xs"
                variant={used === f.value ? "secondary" : "ghost"}
                onClick={() => setUsed(f.value)}
                aria-pressed={used === f.value}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <Button
            size="xs"
            variant={showArchived ? "secondary" : "outline"}
            onClick={() => setShowArchived((v) => !v)}
            aria-pressed={showArchived}
          >
            <Archive />
            {showArchived ? "Archived shown" : "Show archived"}
          </Button>
          {/* Group by theme is a control, not a layout mode — flat is the default (#79). */}
          {liveThemes.length > 0 ? (
            <Button
              size="xs"
              variant={groupByTheme ? "secondary" : "outline"}
              onClick={() => setGroupByTheme((v) => !v)}
              aria-pressed={groupByTheme}
            >
              <Tags />
              Group by theme
            </Button>
          ) : null}
        </div>
      </div>

      {/* Theme filter: narrow the pool to one subject, or to the uncategorised.
          Archived themes are absent from the options (#79); click the active chip to
          clear. Every count is over `scoped` — see above.
          The row survives an empty vocabulary as long as something is uncategorised:
          with no live Theme at all, EVERY Idea is uncategorised, and that is precisely
          when the tagging queue is the thing Davide came for — gating the whole row on
          the vocabulary would hide it in the one case it matters most. */}
      {liveThemes.length > 0 || uncategorised > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <Tag aria-hidden className="size-3" />
            Theme
          </span>
          <Button
            size="xs"
            variant={activeThemeId === null ? "secondary" : "ghost"}
            onClick={() => setThemeFilter(null)}
            aria-pressed={activeThemeId === null}
          >
            All
            <span className="tabular-nums opacity-60">{scoped.length}</span>
          </Button>
          {liveThemes.map((t) => (
            <Button
              key={t.id}
              size="xs"
              variant={activeThemeId === t.id ? "secondary" : "outline"}
              onClick={() => setThemeFilter((cur) => (cur === t.id ? null : t.id))}
              aria-pressed={activeThemeId === t.id}
            >
              {t.label}
              <span className="tabular-nums opacity-60">{themeCounts[t.id] ?? 0}</span>
            </Button>
          ))}
          {/* Not a subject but a work queue: what nobody has categorised yet. Dashed
              while inactive, so it reads as the absence it stands for. */}
          {uncategorised > 0 || activeThemeId === NO_THEME ? (
            <Button
              size="xs"
              variant={activeThemeId === NO_THEME ? "secondary" : "outline"}
              className={activeThemeId === NO_THEME ? undefined : "border-dashed"}
              onClick={() => setThemeFilter((cur) => (cur === NO_THEME ? null : NO_THEME))}
              aria-pressed={activeThemeId === NO_THEME}
            >
              <TagX />
              No theme
              <span className="tabular-nums opacity-60">{uncategorised}</span>
            </Button>
          ) : null}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState>No Ideas match — clear the search or filters.</EmptyState>
      ) : groupByTheme ? (
        themeGroups.map((g) => <Band key={g.title} title={g.title} items={g.items} {...band} />)
      ) : (
        <>
          {/* 1. What just landed — the repair band, and the reason the view exists. */}
          {triage.justCaptured.length > 0 ? (
            <Band
              title={`Just captured · ≤${TUNING.justCapturedDays}d`}
              // A fact and a window, not an instruction: what landed inside the span in
              // which the words can still be checked against what was meant, and how
              // many of them nobody has been back to. ADR-0021 dec.1 — the console
              // states what is so; what to do about it stays Davide's.
              note={
                <>
                  Captured in the last {TUNING.justCapturedDays} days — the window in which the
                  words can still be checked against what you meant.{" "}
                  {freshNeverEdited > 0
                    ? `${freshNeverEdited} never edited since capture.`
                    : "Every one has been edited since."}
                </>
              }
              items={triage.justCaptured}
              {...band}
            />
          ) : null}

          {/* 2. #77's band, unchanged in meaning: never used, and sitting a long
              while. Empty whenever nothing is that stale — which is today, since the
              oldest Idea is 10 days old and the threshold is 45. Silence is the
              all-clear here, the way it is for a Beat. */}
          {triage.candidates.length > 0 ? (
            <Band
              title={`Candidates to work · idle ≥${TUNING.candidateIdleDays}d`}
              note="Never became output, and has sat this long untouched. Oldest first."
              items={triage.candidates}
              {...band}
            />
          ) : null}

          {/* 3. The rest of the pool, so nothing is only reachable through a band. */}
          {triage.rest.length > 0 ? (
            <Band
              title={
                triage.justCaptured.length > 0 || triage.candidates.length > 0
                  ? "Everything else"
                  : "Ideas"
              }
              items={triage.rest}
              {...band}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
