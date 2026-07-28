"use client";

// The console's capture door (#118) — the third one, beside the `/idea` skill and the
// AI apps (ADR-0014). A spark noticed while looking at the pool should not need another
// door, and here it lands where it can be repaired immediately: the Idea it creates is
// zero days old and never edited, so it appears at the head of the "Just captured" band
// the moment the write revalidates.
//
// **Capture first, judge later.** No channel, no flag, no Theme, no date — every one of
// those is the Desk's question and none of them is asked here. What the other doors do
// with an LLM (distil a readable title from the spark) this one asks for, because the
// console has no model and must not gain one (ADR-0002): the title is optional and an
// Idea without one falls back to its body wherever it is shown.
//
// It writes through `capture_idea` like every other door, with `source = 'console'`, so
// where a spark came from stays legible on its card.

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";

import { DetailSheet } from "@/components/detail/detail-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { captureIdea } from "@/lib/actions";

export function CaptureIdea() {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setBody("");
    setTitle("");
    setError(null);
  }

  function capture() {
    setError(null);
    startTransition(async () => {
      const res = await captureIdea(body, title);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      reset();
    });
  }

  return (
    <>
      <Button
        size="xs"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Plus />
        Capture
      </Button>

      <DetailSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
        title="Capture an Idea"
        description="Capture first, judge later — no channel, no flag, no theme."
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">The spark</span>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={9}
              placeholder="Whatever it was, in your own words…"
              aria-label="The spark"
            />
          </div>

          <div className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Title</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A short summary (optional)"
              className="h-8"
              aria-label="Title"
            />
            <span className="text-muted-foreground text-[0.7rem]">
              Optional — left empty, the spark itself is the headline. It can be corrected from the
              card afterwards.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button size="sm" onClick={capture} disabled={pending || !body.trim()}>
              Capture
            </Button>
            <span className="text-muted-foreground text-xs">
              Lands live in the pool, from <span className="font-medium">console</span>.
            </span>
          </div>

          {error ? <p className="text-destructive text-xs">{error}</p> : null}
        </div>
      </DetailSheet>
    </>
  );
}
