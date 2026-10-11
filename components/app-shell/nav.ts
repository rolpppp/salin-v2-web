export type NavItem = { href: string; label: string; match: string };

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/today", label: "Today", match: "/today" },
  { href: "/money-in", label: "Money in", match: "/money-in" },
  { href: "/review", label: "Review", match: "/review" },
  { href: "/plans/split", label: "Plans", match: "/plans" },
];

export function isActive(pathname: string, item: NavItem): boolean {
  return pathname === item.match || pathname.startsWith(`${item.match}/`);
}
