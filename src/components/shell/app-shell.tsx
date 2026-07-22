"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/lib/auth-actions";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  user,
  children,
}: {
  user: { email?: string | null; name?: string | null } | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="bg-card fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r px-3 py-4 lg:flex">
        <div className="flex items-center gap-2.5 px-2 pb-4">
          {/* Personal brand mark (di + red cursor) — shared with davideimola.dev. */}
          {/* biome-ignore lint/performance/noImgElement: tiny static SVG logo */}
          <img src="/brand/mark.svg" alt="" width={30} height={30} className="rounded-md" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">Editorial HQ</p>
            <p className="text-muted-foreground text-xs">davideimola.dev</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {user ? (
          <div className="border-t pt-3">
            <p
              className="text-muted-foreground truncate px-3 pb-2 text-xs"
              title={user.email ?? ""}
            >
              {user.email ?? user.name}
            </p>
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors"
              >
                <LogOut className="size-4 shrink-0" />
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </aside>

      {/* Mobile top bar */}
      <header className="bg-background/80 sticky top-0 z-20 flex h-14 items-center justify-between border-b px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          {/* biome-ignore lint/performance/noImgElement: tiny static SVG logo */}
          <img src="/brand/mark.svg" alt="" width={24} height={24} className="rounded" />
          <span className="text-sm font-semibold tracking-tight">Editorial HQ</span>
        </div>
        {user ? (
          <form action={signOutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              className="text-muted-foreground hover:text-foreground -mr-2 p-2"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        ) : null}
      </header>

      {/* Content */}
      <main className="pb-20 lg:pb-0 lg:pl-56">{children}</main>

      {/* Mobile bottom tab bar */}
      <nav className="bg-background/90 fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t backdrop-blur lg:hidden">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[0.65rem]",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("size-5", active && "text-primary")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
