"use client";

import { Archive, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { IdeaDetail } from "@/components/detail/idea-detail";
import { EmptyState, idleDays, Section } from "@/components/pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { IdeaWithProvenance } from "@/lib/pipeline";

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

// The triage list (#77, Variant A): a single column with a "Candidates to work" band
// above "Everything else", plus free-text search, a used/never-used filter, and an
// archived toggle (off by default — live pool only). All filtering is client-side
// over the pool loaded server-side; the drawer/card come from #76.
export function IdeasView({ ideas }: { ideas: IdeaWithProvenance[] }) {
  const [query, setQuery] = useState("");
  const [used, setUsed] = useState<UsedFilter>("all");
  const [showArchived, setShowArchived] = useState(false);

  const { candidates, rest, total } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = ideas.filter((i) => {
      if (i.status === "archived" && !showArchived) return false;
      if (used === "used" && i.usedCount === 0) return false;
      if (used === "never" && i.usedCount > 0) return false;
      if (q && !`${i.title ?? ""}\n${i.body}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return {
      candidates: filtered.filter(isCandidate),
      rest: filtered.filter((i) => !isCandidate(i)),
      total: filtered.length,
    };
  }, [ideas, query, used, showArchived]);

  // Candidates float to the top; everything else sits below. When there are no
  // candidates the remainder is just the pool, headed "Ideas".
  const groups: { title: string; items: IdeaWithProvenance[] }[] = [];
  if (candidates.length > 0) groups.push({ title: "Candidates to work", items: candidates });
  if (rest.length > 0)
    groups.push({ title: candidates.length > 0 ? "Everything else" : "Ideas", items: rest });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {/* Controls: search + used filter + archived toggle. */}
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
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {total === 0 ? (
        <EmptyState>No Ideas match — clear the search or filters.</EmptyState>
      ) : (
        groups.map((g) => (
          <Section key={g.title} title={g.title} count={g.items.length}>
            <div className="flex flex-col gap-2">
              {g.items.map((i) => (
                <IdeaDetail key={i.id} idea={i} />
              ))}
            </div>
          </Section>
        ))
      )}
    </div>
  );
}
