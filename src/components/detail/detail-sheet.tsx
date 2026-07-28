"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

// The detail surface: a right-side Sheet on desktop, a bottom sheet on mobile.
// One component, the side chosen by viewport — the panel that shows a card's full
// content and its actions.
export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className="gap-0 sm:max-w-md data-[side=bottom]:max-h-[88vh] data-[side=bottom]:rounded-t-xl"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

// ── the opener contract ───────────────────────────────────────────────────────
// One shared way to open any detail drawer from something that is not the thing's
// own card (#111): the caller hands the drawer a `trigger` — a render function that
// receives the drawer's `open` callback and returns whatever it wants to be clicked
// (an agenda row, a compact line, an icon). Every detail component takes the same
// prop with the same type, so a caller learns it once.
//
// Two constraints this shape exists to respect:
//   * a callback cannot cross from a Server Component into a Client one, so the
//     component that *supplies* a trigger must itself be a client module;
//   * the row model behind such a caller stays pure and directive-free (see
//     `src/lib/rows.ts`) so both sides can build it, and any lookup context it is
//     handed is plain records — a `Map` does not survive the RSC boundary.
export type DetailTrigger = (open: () => void) => React.ReactNode;

// The opener a detail component renders: the caller's `trigger` when it supplied
// one, otherwise the thing's own card wrapped as a trigger. Where a thing has no
// canonical card in the console (an Event, a CFP) the drawer takes a *required*
// trigger and this helper is not involved.
export function DetailOpener({
  trigger,
  open,
  id,
  className,
  children,
}: {
  trigger?: DetailTrigger;
  open: () => void;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (trigger) return <>{trigger(open)}</>;
  return (
    <CardTrigger id={id} className={className} onClick={open}>
      {children}
    </CardTrigger>
  );
}

// A row made into a drawer trigger — the row-shaped counterpart of `CardTrigger`,
// so every list row that opens a drawer looks and focuses the same way.
export function RowTrigger({
  onClick,
  className,
  children,
}: {
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full cursor-pointer items-center gap-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
        className
      )}
    >
      {children}
    </button>
  );
}

// A card made into a drawer trigger — full-width, left-aligned, with a hover cue.
// `id` makes the card an anchor target (e.g. `/pipeline#<pieceId>`, so an Idea's
// provenance list can link through to a Piece, #76): it scrolls into view and
// flashes a ring while it is the URL's `:target`.
export function CardTrigger({
  onClick,
  className,
  id,
  children,
}: {
  onClick: () => void;
  className?: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      className={cn(
        "block w-full cursor-pointer rounded-xl text-left transition-opacity hover:opacity-90 focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
        id && "scroll-mt-20 target:ring-ring target:ring-2 target:ring-offset-2",
        className
      )}
    >
      {children}
    </button>
  );
}
