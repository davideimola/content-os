// The agenda's row model: what sits on a date, ready to be rendered as a row that
// opens that thing's drawer (#111).
//
// **Pure and directive-free on purpose.** A Server Component may not call a function
// that lives in a client module, and the row *component* must be a client module (it
// hands a drawer a callback, which cannot cross the RSC boundary). So the model lives
// here, where both sides can build it. The type imports below are erased at compile
// time, which is why importing them from the `server-only` read module is safe.

import type { CalendarItem, PieceWithBlocker } from "@/lib/pipeline";

// One thing on one date. A piece row carries the whole Piece, because its drawer
// offers every action the card's drawer does and needs the full record; a CFP or
// Event row carries only the by-date fact and finds the rest in the plain-record
// `EngagementContext` its component is handed.
export type Row =
  | { kind: "piece"; item: CalendarItem; piece: PieceWithBlocker | null }
  | { kind: "cfp"; item: CalendarItem }
  | { kind: "event"; item: CalendarItem };

// A stable React key: ids are unique per table, kinds are not.
export const rowKey = (row: Row): string => `${row.item.kind}-${row.item.id}`;

// Pair the by-date items with the Pieces behind them. Both reads come from the same
// table, so a piece row without its Piece cannot normally happen — it degrades to a
// row with no drawer rather than dropping the item out of the agenda.
export function buildRows(items: CalendarItem[], pieces: PieceWithBlocker[]): Row[] {
  const byId = new Map<string, PieceWithBlocker>(pieces.map((p) => [p.id, p]));
  return items.map((item) => {
    if (item.kind === "piece") return { kind: "piece", item, piece: byId.get(item.id) ?? null };
    return { kind: item.kind, item };
  });
}

// Group rows into [date, rows] pairs, preserving the incoming order (the reads sort
// by date, so the pairs come out in date order too).
export function groupRowsByDate(rows: Row[]): [string, Row[]][] {
  const byDate = new Map<string, Row[]>();
  for (const row of rows) {
    const list = byDate.get(row.item.date) ?? [];
    list.push(row);
    byDate.set(row.item.date, list);
  }
  return [...byDate.entries()];
}
