"use client";

import { CalendarDays, Pencil } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { CopyId } from "@/components/copy-id";
import { DetailOpener, DetailSheet, type DetailTrigger } from "@/components/detail/detail-sheet";
import { ThemeTagger } from "@/components/detail/theme-tagger";
import { ChannelBadge, formatDate, IdeaCard, StateBadge, UsedBadge } from "@/components/pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { archiveIdea, editIdea } from "@/lib/actions";
import type { IdeaWithProvenance, Theme } from "@/lib/pipeline";

// `trigger` is the shared opener contract (`DetailTrigger`): omit it for the Idea's
// own card, supply one to open the same drawer from a row.
export function IdeaDetail({
  idea,
  themes,
  themesInUse,
  trigger,
}: {
  idea: IdeaWithProvenance;
  themes: Theme[];
  themesInUse: string[];
  trigger?: DetailTrigger;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(idea.title ?? "");
  const [body, setBody] = useState(idea.body);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      <DetailOpener trigger={trigger} open={() => setOpen(true)} className="h-full">
        <IdeaCard idea={idea} />
      </DetailOpener>

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
                    // Where a Piece is visible now that the board has dissolved
                    // (#116): a dated one on the Calendar, an undated proposal in the
                    // Overview's "To judge" grid — both render it as an anchored card,
                    // so `#<id>` scrolls to it and flashes. A declined Piece has no
                    // card anywhere, so it shows (honest provenance) but not as a
                    // dead link.
                    const href =
                      p.state === "declined"
                        ? null
                        : p.publish_date
                          ? `/calendar#${p.id}`
                          : `/#${p.id}`;
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

            {/* Themes: a hand-assigned subject lens (#78) — a creatable multi
                combobox (pick from the live vocabulary, or type to mint a new one).
                Every change replaces the set via set_idea_themes and reflects after
                revalidation; archiving an unused theme lives in the tagger. */}
            <div className="flex flex-col gap-2 border-t pt-4">
              <p className="text-sm font-medium">Themes</p>
              <ThemeTagger
                target={{ kind: "idea", id: idea.id }}
                assigned={idea.themes}
                themes={themes}
                themesInUse={themesInUse}
              />
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
