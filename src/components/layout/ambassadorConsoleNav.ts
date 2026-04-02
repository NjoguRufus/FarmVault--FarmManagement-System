import {
  LayoutDashboard,
  Users,
  Banknote,
  Share2,
  Settings,
  type LucideIcon,
} from "lucide-react";

export const AMBASSADOR_CONSOLE_BASE = "/ambassador/console";

export type AmbassadorConsoleNavItem = {
  to: string;
  label: string;
  /** Shorter label for the mobile bottom bar */
  shortLabel?: string;
  icon: LucideIcon;
};

export const ambassadorConsoleNav: AmbassadorConsoleNavItem[] = [
  {
    to: `${AMBASSADOR_CONSOLE_BASE}/dashboard`,
    label: "Dashboard",
    shortLabel: "Home",
    icon: LayoutDashboard,
  },
  {
    to: `${AMBASSADOR_CONSOLE_BASE}/referrals`,
    label: "Referrals",
    shortLabel: "Refs",
    icon: Users,
  },
  {
    to: `${AMBASSADOR_CONSOLE_BASE}/earnings`,
    label: "Earnings",
    shortLabel: "Earn",
    icon: Banknote,
  },
  {
    to: `${AMBASSADOR_CONSOLE_BASE}/refer`,
    label: "Refer & QR",
    shortLabel: "Share",
    icon: Share2,
  },
  {
    to: `${AMBASSADOR_CONSOLE_BASE}/settings`,
    label: "Settings",
    shortLabel: "More",
    icon: Settings,
  },
];
