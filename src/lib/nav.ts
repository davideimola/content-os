import {
  CalendarDays,
  LayoutDashboard,
  Lightbulb,
  LineChart,
  type LucideIcon,
  Mic,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

// The console's five views. Order = sidebar order = mobile tab order.
//
// FIVE, not six: the Pipeline board dissolved (#116). Of 18 Pieces, 14 were dated and
// 3 proposed, so with the proposed column gone its remaining columns held exactly the
// set the Calendar already shows, re-sorted by state. Every Piece has a better home —
// dated ones on the Calendar, proposals on the Overview.
export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/talks", label: "Talks", icon: Mic },
  { href: "/metrics", label: "Metrics", icon: LineChart },
];
