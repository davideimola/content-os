"use client";

import { Archive, Search, Tag, Tags } from "lucide-react";
import { useMemo, useState } from "react";

import { IdeaDetail } from "@/components/detail/idea-detail";
import { EmptyState, idleDays, Section } from "@/components/pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { IdeaWithProvenance, Theme } from "@/lib/pipeline";

// A never-used spark idle at least this long floats into "Candidates to work" (#77).
// A single tunable constant — the first cut, not a contract; easy to adjust later.
const CANDIDATE_IDLE_DAYS = 45;

type UsedFilter = "all" | "used" | "never";
const USED_FILTERS: { value: UsedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "used", label: "Used" },
  { value: "never", label: "Never used" },
];

// A live, never-used spark that has sat idle a while — the sparks most worth acting
// on. Archived Ideas are never candidates.
function isCandidate(idea: IdeaWithProvenance): boolean {
  return (
    idea.status === "live" &&
    idea.usedCount === 0 &&
    (idleDays(idea.created_at) ?? 0) >= CANDIDATE_IDLE_DAYS
  );
}

// Does this Idea carry the given theme? (#79 — the membership test the theme
// filter and the by-theme grouping share.)
function hasTheme(idea: IdeaWithProvenance, themeId: string): boolean {
  return idea.themes.some((t) => t.id === themeId);
}

// One triage section: a heading over the Ideas under it.
type Group = { title: string; items: IdeaWithProvenance[] };

// The triage list (#77, Variant A): a single column with a "Candidates to work" band
// above "Everything else", plus free-text search, a used/never-used filter, and an
// archived toggle (off by default — live pool only). #79 adds the theme lens: an
// optional "Group by theme" control (flat stays the default) and a single-theme
// filter, both over live themes only. All filtering is client-side over the pool
// loaded server-side; the drawer/card come from #76.
export function IdeasView({
  ideas,
  themes,
  usedThemeIds,
}: {
  ideas: IdeaWithProvenance[];
  themes: Theme[];
  usedThemeIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [used, setUsed] = useState<UsedFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [groupByTheme, setGroupByTheme] = useState(false);
  const [themeFilter, setThemeFilter] = useState<string | null>(null);
  // Only live themes are group/filter options — archived drop out (#79).
  const liveThemes = useMemo(() => themes.filter((t) => !t.archived), [themes]);
  // The active filter, normalised against the live list: a theme archived while it
  // was the active filter (allowed from the drawer, #78) stops filtering instead of
  // leaving a phantom filter with no chip to clear.
  const activeThemeId =
    themeFilter && liveThemes.some((t) => t.id === themeFilter) ? themeFilter : null;

  // The pool after search + used + archived + theme-filter. One pass; grouping is
  // applied on top of this (flat by default, by theme on demand).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ideas.filter((i) => {
      if (i.status === "archived" && !showArchived) return false;
      if (used === "used" && i.usedCount === 0) return false;
      if (used === "never" && i.usedCount > 0) return false;
      if (activeThemeId && !hasTheme(i, activeThemeId)) return false;
      if (q && !`${i.title ?? ""}\n${i.body}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ideas, query, used, showArchived, activeThemeId]);
  const total = filtered.length;

  // Flat is the default (candidates band over everything else, #77); "Group by
  // theme" (#79) regroups the same pool under each live theme instead — an Idea
  // appears under every theme it carries, and those with no live theme fall into a
  // trailing "No theme" band so the pool stays fully visible.
  const groups = useMemo<Group[]>(() => {
    if (groupByTheme) {
      const gs: Group[] = liveThemes
        .map((t) => ({ title: t.label, items: filtered.filter((i) => hasTheme(i, t.id)) }))
        .filter((g) => g.items.length > 0);
      const liveIds = new Set(liveThemes.map((t) => t.id));
      const untagged = filtered.filter((i) => !i.themes.some((th) => liveIds.has(th.id)));
      if (untagged.length > 0) gs.push({ title: "No theme", items: untagged });
      return gs;
    }
    const candidates = filtered.filter(isCandidate);
    const rest = filtered.filter((i) => !isCandidate(i));
    const gs: Group[] = [];
    if (candidates.length > 0) gs.push({ title: "Candidates to work", items: candidates });
    if (rest.length > 0)
      gs.push({ title: candidates.length > 0 ? "Everything else" : "Ideas", items: rest });
    return gs;
  }, [filtered, groupByTheme, liveThemes]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {/* Controls: search + used filter + archived toggle + group-by-theme. */}
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

      {/* Theme filter: narrow the pool to a single subject. Archived themes are
          absent from the options (#79); click the active chip to clear. */}
      {liveThemes.length > 0 ? (
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
            </Button>
          ))}
        </div>
      ) : null}

      {total === 0 ? (
        <EmptyState>No Ideas match — clear the search or filters.</EmptyState>
      ) : (
        groups.map((g) => (
          <Section key={g.title} title={g.title} count={g.items.length}>
            <div className="flex flex-col gap-2">
              {g.items.map((i) => (
                <IdeaDetail key={i.id} idea={i} themes={themes} themesInUse={usedThemeIds} />
              ))}
            </div>
          </Section>
        ))
      )}
    </div>
  );
}
