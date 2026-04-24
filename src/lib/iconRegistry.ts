// Centralized lucide icon resolver for backend-driven menu items.
// Add icons here as needed; unknown names safely return null.
import {
  Tag, Sparkles, Trophy, Flame, Home, ShoppingCart, ShoppingBag, Heart,
  User, Store, ShieldAlert, HelpCircle, Settings, Bell, Star, FileText,
  LogIn, Package, BarChart3, Wallet, CreditCard, IndianRupee, Users,
  Megaphone, LayoutGrid, LayoutDashboard, MessageSquare, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  tag: Tag,
  sparkles: Sparkles,
  trophy: Trophy,
  flame: Flame,
  home: Home,
  cart: ShoppingCart,
  "shopping-cart": ShoppingCart,
  bag: ShoppingBag,
  "shopping-bag": ShoppingBag,
  heart: Heart,
  user: User,
  store: Store,
  shield: ShieldAlert,
  "shield-alert": ShieldAlert,
  help: HelpCircle,
  "help-circle": HelpCircle,
  settings: Settings,
  bell: Bell,
  star: Star,
  file: FileText,
  "file-text": FileText,
  login: LogIn,
  "log-in": LogIn,
  package: Package,
  chart: BarChart3,
  "bar-chart": BarChart3,
  wallet: Wallet,
  card: CreditCard,
  "credit-card": CreditCard,
  dollar: IndianRupee,
  "dollar-sign": IndianRupee,
  rupee: IndianRupee,
  "indian-rupee": IndianRupee,
  users: Users,
  megaphone: Megaphone,
  grid: LayoutGrid,
  "layout-grid": LayoutGrid,
  dashboard: LayoutDashboard,
  "layout-dashboard": LayoutDashboard,
  message: MessageSquare,
  "message-square": MessageSquare,
};

export function resolveLucideIcon(name?: string | null): LucideIcon | null {
  if (!name) return null;
  return ICONS[name.toLowerCase()] ?? null;
}
