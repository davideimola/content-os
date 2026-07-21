"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { declinePiece, deslotPiece, slotPiece } from "@/lib/actions";
import type { PieceState } from "@/lib/pipeline";

export function PieceActions({ pieceId, state }: { pieceId: string; state: PieceState }) {
  const [pending, startTransition] = useTransition();
  const [slotting, setSlotting] = useState(false);
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Only proposed and slotted Pieces have verbs in this slice (ADR-0016 slice 2).
  if (state !== "proposed" && state !== "slotted") return null;

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setSlotting(false);
        setDate("");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      {state === "proposed" && !slotting ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setSlotting(true)} disabled={pending}>
            Slot
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => run(() => declinePiece(pieceId))}
            disabled={pending}
          >
            Decline
          </Button>
        </div>
      ) : null}

      {state === "proposed" && slotting ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-7 w-auto text-[0.8rem]"
            aria-label="Publish date"
          />
          <Button
            size="sm"
            onClick={() => run(() => slotPiece(pieceId, date))}
            disabled={pending || !date}
          >
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSlotting(false);
              setError(null);
            }}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {state === "slotted" ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => run(() => deslotPiece(pieceId))}
            disabled={pending}
          >
            Deslot
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
