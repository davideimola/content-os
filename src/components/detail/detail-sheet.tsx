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
