"use client";

// The Metrics view's drawer openers (#120), on the shared opener contract from #111.
// Metrics is where Davide notices that a Piece has no post linked or no artifact URL,
// and both of those are fixed **in the Piece's drawer** — so the row that shows the
// gap opens the drawer that closes it, and the view is a place to correct rather than
// only a place to read (ADR-0021's keep-a-view criterion).
//
// A **client module** by necessity: a row hands the drawer a `trigger` callback and a
// callback cannot cross from a Server Component into a Client one. The row *bodies*
// stay server-rendered — they come in as `children`, which do cross that boundary —
// so all this module owns is the opener, not the layout of any panel.
//
// These stay separate from `drawer-rows.tsx` (the by-date rows) because they carry no
// row model of their own: the caller composes the body, the row only makes it open.

import { RowTrigger } from "@/components/detail/detail-sheet";
import { IdeaDetail } from "@/components/detail/idea-detail";
import { PieceDetail } from "@/components/detail/piece-detail";
import type {
  IdeaWithProvenance,
  PieceMetrics,
  PieceWithBlocker,
  ThemeContext,
} from "@/lib/pipeline";

// One row's padding, shared so every Metrics list sits on the same rhythm.
const METRIC_ROW = "items-start gap-3 px-3 py-2";

// Deliberately NO `id` on these rows, unlike the by-date ones: the only anchor link
// into a Piece is `/calendar#<pieceId>` (an Idea's provenance list), and one Piece can
// legitimately appear in two panels here — per-Piece performance and published-with-no-
// artifact — which with an id would emit the same DOM id twice.

export function PieceRow({
  piece,
  metrics,
  themes,
  children,
}: {
  piece: PieceWithBlocker;
  metrics?: PieceMetrics;
  themes: ThemeContext;
  children: React.ReactNode;
}) {
  return (
    <PieceDetail
      piece={piece}
      metrics={metrics}
      themes={themes}
      trigger={(open) => (
        <RowTrigger onClick={open} className={METRIC_ROW}>
          {children}
        </RowTrigger>
      )}
    />
  );
}

export function IdeaRow({
  idea,
  themes,
  children,
}: {
  idea: IdeaWithProvenance;
  themes: ThemeContext;
  children: React.ReactNode;
}) {
  return (
    <IdeaDetail
      idea={idea}
      themes={themes.vocabulary}
      themesInUse={themes.inUse}
      trigger={(open) => (
        <RowTrigger onClick={open} className={METRIC_ROW}>
          {children}
        </RowTrigger>
      )}
    />
  );
}
