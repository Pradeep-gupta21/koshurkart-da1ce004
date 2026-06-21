import {
  LayoutDashboard, Users, ShieldAlert, Megaphone, Wallet, LayoutGrid,
  MessageSquare, IndianRupee, CreditCard, Settings, Package, BarChart3,
  ShoppingBag, Bell, Home, Tag, Sparkles, ShoppingCart, User as UserIcon,
  Star, Store, HelpCircle, LogIn, FileText, Heart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavRole = "guest" | "user" | "vendor" | "admin";

export interface NavItem {
  id: string;
  label: string;
  to?: string;
  icon?: LucideIcon;
  roles?: NavRole[]; // undefined = visible to everyone
  children?: NavItem[];
  badgeKey?: "pendingVendors" | "suspiciousReviews" | "pendingPayments" | "newOrders" | "unreadNotifications";
  end?: boolean;
  external?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  roles?: NavRole[];
}

/* ------------------------------ SHOPPER NAV ------------------------------ */

export const SHOPPER_CATEGORIES = [
  "Electronics", "Fashion", "Home & Living", "Sports", "Beauty", "Books",
];

export const shopperNav: NavSection[] = [
  {
    id: "discover",
    label: "Discover",
    items: [
      { id: "home", label: "Home", to: "/", icon: Home, end: true },
      { id: "deals", label: "Today's Deals", to: "/search?sort=discount", icon: Tag },
      { id: "trending", label: "Trending", to: "/search?sort=trending", icon: Sparkles },
    ],
  },
  {
    id: "departments",
    label: "Shop by Department",
    items: SHOPPER_CATEGORIES.map((cat) => ({
      id: `cat-${cat}`,
      label: cat,
      to: `/search?category=${encodeURIComponent(cat)}`,
    })),
  },
  {
    id: "account",
    label: "Your Account",
    items: [
      { id: "signin", label: "Sign in", to: "/auth", icon: LogIn, roles: ["guest"] },
      { id: "profile", label: "Profile", to: "/profile", icon: UserIcon, roles: ["user", "vendor", "admin"] },
      { id: "cart", label: "Cart", to: "/cart", icon: ShoppingCart, roles: ["user", "vendor", "admin"] },
      { id: "orders", label: "Your Orders", to: "/profile?tab=orders", icon: FileText, roles: ["user", "vendor", "admin"] },
      { id: "reviews", label: "Your Reviews", to: "/profile?tab=reviews", icon: Star, roles: ["user", "vendor", "admin"] },
      { id: "wishlist", label: "Wishlist", to: "/profile?tab=wishlist", icon: Heart, roles: ["user", "vendor", "admin"] },
    ],
  },
  {
    id: "sell",
    label: "Sell & Earn",
    items: [
      { id: "vendor-apply", label: "Sell on Nexus", to: "/vendor/apply", icon: Store, roles: ["guest", "user"] },
      { id: "vendor-dash", label: "Vendor Dashboard", to: "/vendor", icon: Store, roles: ["vendor"] },
      { id: "admin-dash", label: "Admin Panel", to: "/admin", icon: ShieldAlert, roles: ["admin"] },
    ],
  },
  {
    id: "help",
    label: "Help & Settings",
    items: [
      { id: "help", label: "Customer Service", to: "/help", icon: HelpCircle },
      { id: "privacy", label: "Privacy Policy", to: "/privacy-policy", icon: FileText },
    ],
  },
];

/* ------------------------------ ADMIN NAV ------------------------------ */

export const adminNav: NavSection[] = [
  {
    id: "admin-main",
    label: "Administration",
    roles: ["admin"],
    items: [
      { id: "a-overview", label: "Overview", to: "/admin", icon: LayoutDashboard, end: true },
      { id: "a-vendors", label: "Vendors", to: "/admin/vendors", icon: Users, badgeKey: "pendingVendors" },
      { id: "a-campaigns", label: "Campaigns", to: "/admin/campaigns", icon: Megaphone },
      { id: "a-placements", label: "Ad Pricing", to: "/admin/placements", icon: LayoutGrid },
      { id: "a-payouts", label: "Payouts", to: "/admin/payouts", icon: Wallet },
      { id: "a-reviews", label: "Reviews", to: "/admin/reviews", icon: MessageSquare, badgeKey: "suspiciousReviews" },
      { id: "a-pricing", label: "Dynamic Pricing", to: "/admin/pricing", icon: IndianRupee },
      { id: "a-payments", label: "Payments", to: "/admin/payments", icon: CreditCard, badgeKey: "pendingPayments" },
      { id: "a-menu", label: "Menu", to: "/admin/menu", icon: LayoutGrid },
      { id: "a-security", label: "Security", to: "/admin/security", icon: ShieldAlert },
      { id: "a-settings", label: "Settings", to: "/admin/settings", icon: Settings },
    ],
  },
];

/* ------------------------------ VENDOR NAV ------------------------------ */

export const vendorNav: NavSection[] = [
  {
    id: "vendor-main",
    label: "Vendor",
    roles: ["vendor"],
    items: [
      { id: "v-overview", label: "Overview", to: "/vendor", icon: LayoutDashboard, end: true },
      { id: "v-products", label: "Products", to: "/vendor/products", icon: Package },
      { id: "v-orders", label: "Orders", to: "/vendor/orders", icon: ShoppingBag, badgeKey: "newOrders" },
      { id: "v-returns", label: "Returns", to: "/vendor/returns", icon: PackageX, badgeKey: "pendingReturns" },
      { id: "v-campaigns", label: "Ad Campaigns", to: "/vendor/campaigns", icon: Megaphone },
      { id: "v-analytics", label: "Analytics", to: "/vendor/analytics", icon: BarChart3 },
      { id: "v-payments", label: "Payments", to: "/vendor/payments", icon: Wallet },
      { id: "v-notifications", label: "Notifications", to: "/vendor/notifications", icon: Bell, badgeKey: "unreadNotifications" },
      { id: "v-settings", label: "Store Settings", to: "/vendor/settings", icon: Settings },
    ],
  },
];

/* ------------------------------ HELPERS ------------------------------ */

export function filterByRoles(items: NavItem[], roles: NavRole[]): NavItem[] {
  return items
    .filter((it) => !it.roles || it.roles.some((r) => roles.includes(r)))
    .map((it) => ({
      ...it,
      children: it.children ? filterByRoles(it.children, roles) : undefined,
    }));
}

export function filterSections(sections: NavSection[], roles: NavRole[]): NavSection[] {
  return sections
    .filter((s) => !s.roles || s.roles.some((r) => roles.includes(r)))
    .map((s) => ({ ...s, items: filterByRoles(s.items, roles) }))
    .filter((s) => s.items.length > 0);
}
