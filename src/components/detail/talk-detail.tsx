"use client";

import { Pencil } from "lucide-react";
import { useState, useTransition } from "react";

import { CopyId } from "@/components/copy-id";
import { DetailOpener, DetailSheet, type DetailTrigger } from "@/components/detail/detail-sheet";
import { FlagBadge, StateBadge, TalkCard } from "@/components/pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions";
import { declineTalk, editTalk, markTalkReady, startTalkProduction } from "@/lib/actions";
import type { Talk } from "@/lib/pipeline";

// `trigger` is the shared opener contract (`DetailTrigger`): omit it for the Talk's
// own card, supply one to open the same drawer from a row.
//
// This is the **only** place a Talk's readiness is set (#119). The ladder's verbs are
// from-state guarded server-side (`{proposed, ready} → in_production → ready`), and the
// drawer offers exactly the legal move for the state it is looking at — an illegal one
// is not a button that fails, it is a button that is not there. The state it renders is
// `talks.state` through the one `StateBadge`, so a Talk reads the same here, on its
// asset sheet, and on the Calendar's Event row (`eventTalkReadiness`).
export function TalkDetail({ talk, trigger }: { talk: Talk; trigger?: DetailTrigger }) {
  const [open, setOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(talk.title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The same helper `PieceDetail` uses, with the same `closeOnDone` — so declining a Talk
  // closes its drawer exactly as declining a Piece does.
  function run(action: () => Promise<ActionResult>, closeOnDone = false) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        if (closeOnDone) setOpen(false);
      } else {
        setError(res.error);
      }
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
      <DetailOpener trigger={trigger} open={() => setOpen(true)}>
        <TalkCard talk={talk} />
      </DetailOpener>

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

        {/* The ladder (#115's verbs, wired here). One section, one legal move: a deck
            is either being built, finished, or reopened. `declined` has no rung at all
            and says so — the contract's only route into it is `decline_talk` and there
            is none back out, which is a fact worth reading rather than a button to hunt
            for. */}
        <div className="flex flex-col gap-2 border-t pt-4">
          <p className="text-sm font-medium">Slides</p>
          {talk.state === "proposed" ? (
            <>
              <p className="text-muted-foreground text-xs">
                Building the deck? Move it to <span className="font-medium">in production</span>.
              </p>
              <Button
                size="sm"
                className="w-fit"
                onClick={() => run(() => startTalkProduction(talk.id))}
                disabled={pending}
              >
                Start production
              </Button>
            </>
          ) : null}
          {talk.state === "in_production" ? (
            <>
              <p className="text-muted-foreground text-xs">
                Slides finished? Move it to <span className="font-medium">ready</span> — prepared,
                and reusable at the next conference.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                onClick={() => run(() => markTalkReady(talk.id))}
                disabled={pending}
              >
                Mark ready
              </Button>
            </>
          ) : null}
          {talk.state === "ready" ? (
            <>
              <p className="text-muted-foreground text-xs">
                Prepared. Re-cutting it for another conference puts it back into{" "}
                <span className="font-medium">production</span>.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                onClick={() => run(() => startTalkProduction(talk.id))}
                disabled={pending}
              >
                Back into production
              </Button>
            </>
          ) : null}
          {talk.state === "declined" ? (
            <p className="text-muted-foreground text-xs">
              Declined — the ladder has no rung back, so this Talk cannot be returned to production
              from here.
            </p>
          ) : null}
        </div>

        {talk.state !== "declined" ? (
          <div className="border-t pt-4">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => run(() => declineTalk(talk.id), true)}
              disabled={pending}
            >
              Decline
            </Button>
          </div>
        ) : null}

        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </DetailSheet>
    </>
  );
}
