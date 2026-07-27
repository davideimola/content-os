"use client";

// PROTOTYPE — THROWAWAY. Do not merge to main. (wayfinder ticket #86)
// The floating variant bar: ← / label / →, plus a demo-data toggle. Hidden in
// production builds so a stray merge can't ship it.

import { ChevronLeft, ChevronRight, FlaskConical } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import { cn } from "@/lib/utils";

export type VariantKey = string;

// PROTOTYPE (#104) — extra param toggles beside the demo one, so a question can
// be answered by flipping rather than by a rebuild (`?verb=1`, `?act=dated`).
export type ParamToggle = {
  param: string;
  label: string;
  /** the value written when the toggle goes on; absent removes the param */
  on: string;
  active: boolean;
  title?: string;
};

export function PrototypeSwitcher({
  variants,
  current,
  demo,
  toggles = [],
}: {
  variants: { key: VariantKey; name: string }[];
  current: VariantKey;
  demo: boolean;
  toggles?: ParamToggle[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = useCallback(
    (param: string, value: string | null) => {
      const sp = new URLSearchParams(params.toString());
      if (value === null) sp.delete(param);
      else sp.set(param, value);
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  const go = useCallback(
    (next: Partial<{ variant: VariantKey; demo: boolean }>) => {
      const sp = new URLSearchParams(params.toString());
      if (next.variant !== undefined) sp.set("variant", next.variant);
      if (next.demo !== undefined) {
        if (next.demo) sp.set("demo", "1");
        else sp.delete("demo");
      }
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  const idx = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  );
  const cycle = useCallback(
    (delta: number) => {
      const next = variants[(idx + delta + variants.length) % variants.length];
      go({ variant: next.key });
    },
    [go, idx, variants]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle]);

  if (process.env.NODE_ENV === "production") return null;

  const active = variants[idx];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 lg:bottom-6">
      <div className="pointer-events-auto flex items-stretch gap-px overflow-hidden rounded-full bg-neutral-900 text-white shadow-lg ring-1 ring-white/20 dark:bg-white dark:text-neutral-900 dark:ring-black/20">
        <button
          type="button"
          onClick={() => cycle(-1)}
          aria-label="previous variant"
          className="px-3 py-2 hover:bg-white/15 dark:hover:bg-black/10"
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <span className="flex items-center gap-1.5 px-2 py-2 text-xs font-medium whitespace-nowrap">
          <span className="rounded-full bg-white/20 px-1.5 py-0.5 tabular-nums dark:bg-black/10">
            {active.key}
          </span>
          {active.name}
        </span>
        <button
          type="button"
          onClick={() => cycle(1)}
          aria-label="next variant"
          className="px-3 py-2 hover:bg-white/15 dark:hover:bg-black/10"
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => go({ demo: !demo })}
          aria-pressed={demo}
          title="inject synthetic stuck cases"
          className={cn(
            "flex items-center gap-1 border-l border-white/20 px-3 py-2 text-xs dark:border-black/20",
            demo ? "bg-amber-400 text-neutral-900" : "hover:bg-white/15 dark:hover:bg-black/10"
          )}
        >
          <FlaskConical aria-hidden className="size-3.5" />
          demo
        </button>
        {toggles.map((t) => (
          <button
            key={t.param}
            type="button"
            onClick={() => set(t.param, t.active ? null : t.on)}
            aria-pressed={t.active}
            title={t.title}
            className={cn(
              "flex items-center gap-1 border-l border-white/20 px-3 py-2 text-xs dark:border-black/20",
              t.active ? "bg-sky-400 text-neutral-900" : "hover:bg-white/15 dark:hover:bg-black/10"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
