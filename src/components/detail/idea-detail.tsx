"use client";

import { Archive, CalendarDays, Pencil, Plus, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { CopyId } from "@/components/copy-id";
import { CardTrigger, DetailSheet } from "@/components/detail/detail-sheet";
import { ChannelBadge, formatDate, IdeaCard, StateBadge, UsedBadge } from "@/components/pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { archiveIdea, archiveTheme, createTheme, editIdea, setIdeaThemes } from "@/lib/actions";
import type { IdeaWithProvenance, Theme } from "@/lib/pipeline";

export function IdeaDetail({
  idea,
  themes,
  themesInUse,
}: {
  idea: IdeaWithProvenance;
  themes: Theme[];
  themesInUse: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(idea.title ?? "");
  const [body, setBody] = useState(idea.body);
  const [reason, setReason] = useState("");
  const [newTheme, setNewTheme] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Selection is driven straight off props: each write revalidates and the fresh
  // idea.themes flows back in (the drawer stays open). The live picker offers only
  // non-archived themes the Idea doesn't already carry.
  const assignedIds = idea.themes.map((t) => t.id);
  const availableThemes = themes.filter((t) => !t.archived && !assignedIds.includes(t.id));

  // Replace-all: send the full desired set, so a toggle is just add/remove-then-save.
  function applyThemes(next: string[]) {
    setError(null);
    startTransition(async () => {
      const res = await setIdeaThemes(idea.id, next);
      if (!res.ok) setError(res.error);
    });
  }

  function toggleTheme(themeId: string) {
    applyThemes(
      assignedIds.includes(themeId)
        ? assignedIds.filter((id) => id !== themeId)
        : [...assignedIds, themeId]
    );
  }

  // Mint a theme, then assign it to this Idea in the same transition.
  function mintTheme() {
    const label = newTheme.trim();
    if (!label) return;
    setError(null);
    startTransition(async () => {
      const res = await createTheme(label);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const applied = await setIdeaThemes(idea.id, [...assignedIds, res.id]);
      if (applied.ok) setNewTheme("");
      else setError(applied.error);
    });
  }

  function retireTheme(themeId: string) {
    setError(null);
    startTransition(async () => {
      const res = await archiveTheme(themeId);
      if (!res.ok) setError(res.error);
    });
  }

  function startEdit() {
    setTitle(idea.title ?? "");
    setBody(idea.body);
    setError(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await editIdea(idea.id, title, body);
      if (res.ok) setEditing(false);
      else setError(res.error);
    });
  }

  function archive() {
    setError(null);
    startTransition(async () => {
      const res = await archiveIdea(idea.id, reason);
      if (res.ok) {
        setOpen(false);
        setReason("");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <CardTrigger className="h-full" onClick={() => setOpen(true)}>
        <IdeaCard idea={idea} />
      </CardTrigger>

      <DetailSheet
        open={open}
        onOpenChange={setOpen}
        title={idea.title?.trim() || "Idea"}
        description={`Captured ${formatDate(idea.created_at) ?? ""}${idea.source ? ` · ${idea.source}` : ""}`}
      >
        <div className="flex">
          <CopyId id={idea.id} />
        </div>

        {editing ? (
          <div className="flex flex-col gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (short summary)"
              className="h-8"
            />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={9}
              placeholder="The spark, verbatim…"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={pending || !body.trim()}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              {/* The spark, verbatim (ADR-0014). */}
              <p className="flex-1 text-sm leading-relaxed whitespace-pre-wrap text-pretty">
                {idea.body}
              </p>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={startEdit}
                aria-label="Edit idea"
                className="shrink-0"
              >
                <Pencil />
              </Button>
            </div>

            {/* Provenance: the Pieces this Idea spawned, each linking through to
                the Piece on the board (#76). A read-back of piece_sources — no state. */}
            <div className="flex flex-col gap-2 border-t pt-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Spawned Pieces</p>
                <UsedBadge count={idea.usedCount} />
              </div>
              {idea.spawnedPieces.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  Never used — this spark hasn't spawned any Pieces yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {idea.spawnedPieces.map((p) => {
                    // A declined Piece has no card on the board, so there's nowhere
                    // to click through to — show it (honest provenance) but not as a
                    // dead link. Every other state renders a card on /pipeline.
                    const href = p.state === "declined" ? null : `/pipeline#${p.id}`;
                    const inner = (
                      <>
                        <span className="text-sm leading-snug font-medium text-pretty">
                          {p.title}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <ChannelBadge channel={p.channel} />
                          <StateBadge state={p.state} />
                          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                            <CalendarDays aria-hidden className="size-3" />
                            {formatDate(p.publish_date) ?? <span className="italic">no date</span>}
                          </span>
                        </span>
                      </>
                    );
                    return (
                      <li key={p.id}>
                        {href ? (
                          <Link
                            href={href}
                            onClick={() => setOpen(false)}
                            className="hover:bg-muted/50 flex flex-col gap-1.5 rounded-lg border p-2.5 transition-colors"
                          >
                            {inner}
                          </Link>
                        ) : (
                          <div className="flex flex-col gap-1.5 rounded-lg border p-2.5">
                            {inner}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Themes: a hand-assigned subject lens (#78). Pick from the live
                list, mint a new one inline, or archive an unused one. Every write
                round-trips through set_idea_themes / create_theme / archive_theme
                and reflects after revalidation. */}
            <div className="flex flex-col gap-2 border-t pt-4">
              <p className="text-sm font-medium">Themes</p>

              {/* Assigned — click to remove. */}
              {idea.themes.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No themes yet — tag this Idea to group it by subject.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {idea.themes.map((t) => (
                    <Button
                      key={t.id}
                      size="xs"
                      variant="secondary"
                      onClick={() => toggleTheme(t.id)}
                      disabled={pending}
                      aria-label={`Remove theme ${t.label}`}
                    >
                      {t.label}
                      {t.archived ? <span className="opacity-60">(archived)</span> : null}
                      <X />
                    </Button>
                  ))}
                </div>
              )}

              {/* Add from the live list (archived excluded) — click adds. A theme
                  no Idea carries can also be retired via the trailing icon. */}
              {availableThemes.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {availableThemes.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center overflow-hidden rounded-lg border"
                    >
                      <Button
                        size="xs"
                        variant="ghost"
                        className="rounded-none"
                        onClick={() => toggleTheme(t.id)}
                        disabled={pending}
                        aria-label={`Add theme ${t.label}`}
                      >
                        <Plus />
                        {t.label}
                      </Button>
                      {themesInUse.has(t.id) ? null : (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="text-muted-foreground rounded-none border-l"
                          onClick={() => retireTheme(t.id)}
                          disabled={pending}
                          aria-label={`Archive theme ${t.label}`}
                        >
                          <Archive />
                        </Button>
                      )}
                    </span>
                  ))}
                </div>
              ) : null}

              {/* Mint a new theme inline. */}
              <div className="flex gap-2">
                <Input
                  value={newTheme}
                  onChange={(e) => setNewTheme(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      mintTheme();
                    }
                  }}
                  placeholder="New theme…"
                  className="h-8"
                  aria-label="New theme label"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={mintTheme}
                  disabled={pending || !newTheme.trim()}
                >
                  Add
                </Button>
              </div>
            </div>

            {idea.status === "archived" ? (
              <p className="text-muted-foreground border-t pt-4 text-xs">
                Archived — off the live pool, kept on the record.
              </p>
            ) : (
              <div className="flex flex-col gap-2 border-t pt-4">
                <p className="text-muted-foreground text-xs">
                  Archive a duplicate or repudiated Idea (kept on the record, off the pool).
                </p>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (e.g. duplicate of…)"
                  className="h-8"
                />
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-fit"
                  onClick={archive}
                  disabled={pending || !reason.trim()}
                >
                  Archive
                </Button>
              </div>
            )}
          </>
        )}

        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </DetailSheet>
    </>
  );
}
