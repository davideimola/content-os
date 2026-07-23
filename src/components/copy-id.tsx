"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Copy `text` to the clipboard, working on secure origins (Vercel https) and on the
// insecure ones content-os is served from in dev — `pnpm dev` on the LAN over http,
// where `navigator.clipboard` is undefined. The legacy execCommand path is the
// fallback so a one-tap copy still works from the phone (the mobile-first use case).
async function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS Safari needs an explicit range
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// A quiet copy-on-tap chip for a Pipeline reference id (piece_… / idea_… / talk_… /
// eng_… / event_…). The prefixed id is exactly what every other tool takes — the MCP
// verbs, the Desk, the Review — so it earns a one-tap copy wherever an item shows.
// The full id is always copied; the label may truncate but the title/aria carry it.
export function CopyId({ id, className }: { id: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function copy() {
    const ok = await writeClipboard(id);
    if (!ok) return; // clipboard blocked — leave the chip as-is
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1200);
  }

  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={copy}
      title={id}
      aria-label={copied ? "Id copied" : `Copy id ${id}`}
      className={cn(
        "text-muted-foreground hover:text-foreground inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 font-mono text-[0.7rem] leading-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        className
      )}
    >
      <Icon aria-hidden className={cn("size-3 shrink-0", copied && "text-emerald-500")} />
      <span className="truncate">{id}</span>
    </button>
  );
}
