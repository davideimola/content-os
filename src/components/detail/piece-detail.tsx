"use client";

import { Pencil } from "lucide-react";
import { useState, useTransition } from "react";

import { CardTrigger, DetailSheet } from "@/components/detail/detail-sheet";
import { ChannelBadge, FlagBadge, formatDate, PieceCard, StateBadge } from "@/components/pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions";
import {
  declinePiece,
  deslotPiece,
  editPiece,
  publishPiece,
  setPieceArtifact,
  slotPiece,
} from "@/lib/actions";
import type { Piece } from "@/lib/pipeline";

export function PieceDetail({ piece }: { piece: Piece }) {
  const [open, setOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(piece.title);
  const [date, setDate] = useState(piece.publish_date ?? "");
  const [artifact, setArtifact] = useState(piece.artifact_url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      const res = await editPiece(piece.id, title);
      if (res.ok) setEditingTitle(false);
      else setError(res.error);
    });
  }

  const isSlotted = piece.state === "slotted";
  const canSchedule = piece.state === "proposed" || piece.state === "slotted";

  return (
    <>
      <CardTrigger onClick={() => setOpen(true)}>
        <PieceCard piece={piece} />
      </CardTrigger>

      <DetailSheet open={open} onOpenChange={setOpen} title={piece.title}>
        <div className="flex flex-wrap items-center gap-1.5">
          <StateBadge state={piece.state} />
          <ChannelBadge channel={piece.channel} />
          <FlagBadge flagSide={piece.flag_side} />
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
                  setTitle(piece.title);
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
              setTitle(piece.title);
              setError(null);
              setEditingTitle(true);
            }}
          >
            <Pencil />
            Rename
          </Button>
        )}

        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Publish</dt>
          <dd>{formatDate(piece.publish_date) ?? <span className="italic">not slotted</span>}</dd>
          {piece.blocked_by_piece_id ? (
            <>
              <dt className="text-muted-foreground">Blocked by</dt>
              <dd>{piece.blocked_by_piece_id}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Artifact</dt>
          <dd>
            {piece.artifact_url ? (
              <a
                href={piece.artifact_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary break-all underline underline-offset-2"
              >
                {piece.artifact_url}
              </a>
            ) : (
              <span className="text-muted-foreground italic">none</span>
            )}
          </dd>
        </dl>

        {canSchedule ? (
          <div className="flex flex-col gap-2 border-t pt-4">
            <p className="text-sm font-medium">Schedule</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 w-auto"
                aria-label="Publish date"
              />
              <Button
                size="sm"
                onClick={() => run(() => slotPiece(piece.id, date))}
                disabled={pending || !date}
              >
                {isSlotted ? "Reslot" : "Slot"}
              </Button>
              {isSlotted ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => run(() => deslotPiece(piece.id))}
                  disabled={pending}
                >
                  Deslot
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {isSlotted ? (
          <div className="flex flex-col gap-2 border-t pt-4">
            <p className="text-sm font-medium">Publish</p>
            <p className="text-muted-foreground text-xs">
              Mark this Piece shipped once it's live — it moves to{" "}
              <span className="font-medium">published</span> and keeps its date.
            </p>
            <Button
              size="sm"
              className="w-fit"
              onClick={() => run(() => publishPiece(piece.id))}
              disabled={pending}
            >
              Mark shipped
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t pt-4">
          <p className="text-sm font-medium">Artifact URL</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={artifact}
              onChange={(e) => setArtifact(e.target.value)}
              placeholder="https://…"
              className="h-8 min-w-0 flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => run(() => setPieceArtifact(piece.id, artifact))}
              disabled={pending || !artifact.trim()}
            >
              Save
            </Button>
          </div>
        </div>

        {piece.state !== "declined" ? (
          <div className="border-t pt-4">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => run(() => declinePiece(piece.id), true)}
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
