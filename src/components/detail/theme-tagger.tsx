"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Archive, Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { archiveTheme, createTheme, setIdeaThemes, setPieceThemes } from "@/lib/actions";
import type { Theme, ThemeRef } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

// The sentinel id for the synthetic "Create «query»" row — base-ui Combobox has
// no built-in creatable, so we inject an item and materialize it in onValueChange.
const CREATE_ID = "__create__";
type Option = { id: string; label: string };

// What is being tagged. A Theme is a property of the content, so it is carried by
// the spark AND by the output (#112): an Idea and a Piece are tagged by the same
// control, with the same replace-all semantics, through their own verb. The verb
// mapping lives here, once — a call site says what it is, never which RPC to call.
export type ThemeTarget = { kind: "idea" | "piece"; id: string };

const SET_THEMES = { idea: setIdeaThemes, piece: setPieceThemes } as const;

// Tag a target's themes as a creatable multi-combobox (Davide's steer over the
// earlier toggle-chips): selected themes show as chips inside the field, typing
// filters the live vocabulary, and an unmatched query offers "Create «X»". Every
// change replaces the whole set via the target's set verb; a mint routes through
// create_theme first (for the real DB id) and then that verb. Archiving an
// unused theme (#78) stays a discreet row below — it's maintenance, not tagging.
//
// `themesInUse` is a plain array of theme ids (never a Set: this contract has to
// survive being built server-side, #111) — every theme carried by any Idea or any
// Piece, i.e. the ones that may NOT be retired.
export function ThemeTagger({
  target,
  assigned,
  themes,
  themesInUse,
}: {
  target: ThemeTarget;
  assigned: ThemeRef[];
  themes: Theme[];
  themesInUse: string[];
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inUse = useMemo(() => new Set(themesInUse), [themesInUse]);
  const setThemes = SET_THEMES[target.kind];

  const liveThemes = themes.filter((t) => !t.archived);
  const assignedIds = new Set(assigned.map((t) => t.id));
  // The controlled selection — assigned may include a since-archived theme (kept,
  // its label still resolves), so selection is broader than the live options.
  const value: Option[] = assigned.map((t) => ({ id: t.id, label: t.label }));

  // Options: live themes not already assigned, filtered by the query, plus the
  // synthetic "create" row when the query matches no existing live label.
  const q = query.trim();
  const qLower = q.toLowerCase();
  const base = liveThemes
    .filter((t) => !assignedIds.has(t.id) && t.label.toLowerCase().includes(qLower))
    .map((t) => ({ id: t.id, label: t.label }));
  const showCreate = q.length > 0 && !liveThemes.some((t) => t.label.toLowerCase() === qLower);
  const items: Option[] = showCreate ? [...base, { id: CREATE_ID, label: q }] : base;

  // Themes nothing carries — neither an Idea nor a Piece — the only ones that may
  // be retired (#78, widened by #112 now that the output carries Themes too).
  const archivable = liveThemes.filter((t) => !inUse.has(t.id));

  function apply(nextIds: string[]) {
    setError(null);
    startTransition(async () => {
      const res = await setThemes(target.id, nextIds);
      if (!res.ok) setError(res.error);
    });
  }

  function handleValueChange(next: Option[]) {
    const created = next.find((o) => o.id === CREATE_ID);
    if (!created) {
      apply(next.map((o) => o.id));
      return;
    }
    // Mint the new theme, then assign the existing selection + its real id.
    setError(null);
    startTransition(async () => {
      const res = await createTheme(created.label);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const ids = next.filter((o) => o.id !== CREATE_ID).map((o) => o.id);
      if (!ids.includes(res.id)) ids.push(res.id);
      const applied = await setThemes(target.id, ids);
      if (!applied.ok) setError(applied.error);
      setQuery("");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Combobox.Root
        items={items}
        value={value}
        onValueChange={(next: Option[]) => handleValueChange(next)}
        inputValue={query}
        onInputValueChange={(v: string) => setQuery(v)}
        multiple
        filter={null}
        itemToStringLabel={(item: Option) => item.label}
        itemToStringValue={(item: Option) => item.label}
        isItemEqualToValue={(a: Option, b: Option) => a.id === b.id}
      >
        {/* The field: assigned themes as removable chips + the search input. */}
        <div
          className={cn(
            "border-input flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border bg-transparent px-1.5 py-1 text-sm transition-colors",
            "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-3",
            "dark:bg-input/30",
            pending && "opacity-70"
          )}
        >
          {assigned.map((t) => (
            <span
              key={t.id}
              className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 text-xs"
            >
              {t.label}
              {t.archived ? <span className="opacity-60">(archived)</span> : null}
              <button
                type="button"
                onClick={() => apply(assigned.filter((a) => a.id !== t.id).map((a) => a.id))}
                disabled={pending}
                aria-label={`Remove theme ${t.label}`}
                className="hover:bg-foreground/10 inline-flex size-4 items-center justify-center rounded-sm [&>svg]:size-3"
              >
                <X />
              </button>
            </span>
          ))}
          <Combobox.Input
            placeholder={assigned.length === 0 ? "Add or create a theme…" : "Add another…"}
            className="placeholder:text-muted-foreground min-w-24 flex-1 bg-transparent px-1 outline-none"
          />
          <Combobox.Trigger
            aria-label="Open themes"
            className="text-muted-foreground hover:text-foreground inline-flex size-5 items-center justify-center rounded-sm [&>svg]:size-4"
          >
            <ChevronsUpDown />
          </Combobox.Trigger>
        </div>

        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="z-50">
            <Combobox.Popup className="bg-popover text-popover-foreground data-ending-style:opacity-0 data-starting-style:opacity-0 max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-lg border p-1 shadow-md transition-opacity">
              <Combobox.Empty className="text-muted-foreground px-2 py-1.5 text-sm">
                {q.length > 0 ? "No matching theme." : "No themes yet — type to create one."}
              </Combobox.Empty>
              <Combobox.List>
                {(item: Option) => (
                  <Combobox.Item
                    key={item.id}
                    value={item}
                    className="data-highlighted:bg-muted data-highlighted:text-foreground flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                  >
                    {item.id === CREATE_ID ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Plus className="size-3.5" />
                        Create “{item.label}”
                      </span>
                    ) : (
                      <>
                        <Combobox.ItemIndicator className="flex size-3.5 items-center justify-center">
                          <Check className="size-3.5" />
                        </Combobox.ItemIndicator>
                        {item.label}
                      </>
                    )}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      {/* Retire an unused theme (#78) — only themes no Idea carries. */}
      {archivable.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Retire unused:</span>
          {archivable.map((t) => (
            <Button
              key={t.id}
              size="xs"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await archiveTheme(t.id);
                  if (!res.ok) setError(res.error);
                });
              }}
              disabled={pending}
              aria-label={`Archive theme ${t.label}`}
            >
              {t.label}
              <Archive />
            </Button>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
