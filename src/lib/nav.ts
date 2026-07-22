import {
  CalendarDays,
  Columns3,
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

// The dashboard's views. Order = sidebar order = mobile tab order.
export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/talks", label: "Talks", icon: Mic },
  { href: "/metrics", label: "Metrics", icon: LineChart },
];
