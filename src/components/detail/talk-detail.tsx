"use client";

import { useState, useTransition } from "react";

import { CardTrigger, DetailSheet } from "@/components/detail/detail-sheet";
import { FlagBadge, StateBadge, TalkCard } from "@/components/pipeline";
import { Button } from "@/components/ui/button";
import { declineTalk } from "@/lib/actions";
import type { Talk } from "@/lib/pipeline";

export function TalkDetail({ talk }: { talk: Talk }) {
  const [open, setOpen] = useState(false);
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

  return (
    <>
      <CardTrigger onClick={() => setOpen(true)}>
        <TalkCard talk={talk} />
      </CardTrigger>

      <DetailSheet open={open} onOpenChange={setOpen} title={talk.title}>
        <div className="flex flex-wrap items-center gap-1.5">
          <StateBadge state={talk.state} />
          <FlagBadge flagSide={talk.flag_side} />
        </div>

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
