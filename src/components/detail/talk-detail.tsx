"use client";

import { Pencil } from "lucide-react";
import { useState, useTransition } from "react";

import { CopyId } from "@/components/copy-id";
import { CardTrigger, DetailSheet } from "@/components/detail/detail-sheet";
import { FlagBadge, StateBadge, TalkCard } from "@/components/pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { declineTalk, editTalk } from "@/lib/actions";
import type { Talk } from "@/lib/pipeline";

export function TalkDetail({ talk }: { talk: Talk }) {
  const [open, setOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(talk.title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decline() {
    setError(null);
    startTransition(async () => {
      const res = await declineTalk(talk.id);
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  }

  function saveTitle() {
    setError(null);
    startTransition(async () => {
      const res = await editTalk(talk.id, title);
      if (res.ok) setEditingTitle(false);
      else setError(res.error);
    });
  }

  return (
    <>
      <CardTrigger onClick={() => setOpen(true)}>
        <TalkCard talk={talk} />
      </CardTrigger>

      <DetailSheet open={open} onOpenChange={setOpen} title={talk.title}>
        <div className="flex flex-wrap items-center gap-1.5">
          <StateBadge state={talk.state} />
          <FlagBadge flagSide={talk.flag_side} />
          <CopyId id={talk.id} className="ml-auto" />
        </div>

        {editingTitle ? (
          <div className="flex flex-col gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8"
              aria-label="Title"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveTitle} disabled={pending || !title.trim()}>
                Save title
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTitle(talk.title);
                  setEditingTitle(false);
                }}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="-ml-2.5 w-fit"
            onClick={() => {
              setTitle(talk.title);
              setError(null);
              setEditingTitle(true);
            }}
          >
            <Pencil />
            Rename
          </Button>
        )}

        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Brief</dt>
          <dd>
            {talk.brief_url ? (
              <a
                href={talk.brief_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary break-all underline underline-offset-2"
              >
                {talk.brief_url}
              </a>
            ) : (
              <span className="text-muted-foreground italic">none</span>
            )}
          </dd>
        </dl>

        {talk.state !== "declined" ? (
          <div className="border-t pt-4">
            <Button size="sm" variant="destructive" onClick={decline} disabled={pending}>
              Decline
            </Button>
          </div>
        ) : null}

        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </DetailSheet>
    </>
  );
}
