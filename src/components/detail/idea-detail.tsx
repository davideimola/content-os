"use client";

import { Pencil } from "lucide-react";
import { useState, useTransition } from "react";

import { CopyId } from "@/components/copy-id";
import { CardTrigger, DetailSheet } from "@/components/detail/detail-sheet";
import { formatDate, IdeaCard } from "@/components/pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { archiveIdea, editIdea } from "@/lib/actions";
import type { Idea } from "@/lib/pipeline";

export function IdeaDetail({ idea }: { idea: Idea }) {
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
          </>
        )}

        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </DetailSheet>
    </>
  );
}
