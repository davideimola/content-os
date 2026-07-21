"use client";

import { useState, useTransition } from "react";

import { CardTrigger, DetailSheet } from "@/components/detail/detail-sheet";
import { formatDate, IdeaCard } from "@/components/pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { archiveIdea } from "@/lib/actions";
import type { Idea } from "@/lib/pipeline";

export function IdeaDetail({ idea }: { idea: Idea }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      <CardTrigger onClick={() => setOpen(true)}>
        <IdeaCard idea={idea} />
      </CardTrigger>

      <DetailSheet
        open={open}
        onOpenChange={setOpen}
        title={idea.title?.trim() || "Idea"}
        description={`Captured ${formatDate(idea.created_at) ?? ""}${idea.source ? ` · ${idea.source}` : ""}`}
      >
        {/* The spark, verbatim (ADR-0014: the body is the raw Idea). */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-pretty">{idea.body}</p>

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
          {error ? <p className="text-destructive text-xs">{error}</p> : null}
        </div>
      </DetailSheet>
    </>
  );
}
