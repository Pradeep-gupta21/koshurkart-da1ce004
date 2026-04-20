import { useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Search, ShieldCheck, Store } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useAdminNavigation, useVendorNavigation,
  useAdminBadges, useVendorBadges, type BadgeMap,
} from "@/hooks/useNavigation";

interface DashboardSidebarProps {
  variant: "admin" | "vendor";
}

const DashboardSidebar = ({ variant }: DashboardSidebarProps) => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const [search, setSearch] = useState("");

  const adminSections = useAdminNavigation();
  const vendorSections = useVendorNavigation();
  const adminBadges = useAdminBadges();
  const vendorBadges = useVendorBadges();

  const sections = variant === "admin" ? adminSections : vendorSections;
  const badges: BadgeMap = variant === "admin" ? adminBadges : vendorBadges;

  const filtered = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.toLowerCase();
    return sections
      .map((s) => ({ ...s, items: s.items.filter((i) => i.label.toLowerCase().includes(q)) }))
      .filter((s) => s.items.length > 0);
  }, [sections, search]);

  const isActive = (to: string, end?: boolean) =>
    end ? location.pathname === to : location.pathname.startsWith(to);

  const HeaderIcon = variant === "admin" ? ShieldCheck : Store;
  const headerLabel = variant === "admin" ? "Admin Panel" : "Vendor Panel";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <HeaderIcon className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-sidebar-foreground truncate">{headerLabel}</span>
          )}
        </div>
        {!collapsed && (
          <div className="px-2 pb-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search menu…"
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {filtered.map((section) => (
          <SidebarGroup key={section.id}>
            {!collapsed && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.to ? isActive(item.to, item.end) : false;
                  const badgeCount = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton asChild tooltip={item.label}>
                        <NavLink
                          to={item.to ?? "#"}
                          end={item.end}
                          className={cn(
                            "flex items-center gap-2 w-full",
                            active && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          )}
                        >
                          {Icon && <Icon className="h-4 w-4 shrink-0" />}
                          {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                          {!collapsed && badgeCount > 0 && (
                            <Badge
                              variant={item.badgeKey === "suspiciousReviews" ? "destructive" : "secondary"}
                              className="h-5 min-w-[20px] px-1.5 text-[10px]"
                            >
                              {badgeCount > 99 ? "99+" : badgeCount}
                            </Badge>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        {filtered.length === 0 && !collapsed && (
          <p className="px-4 py-6 text-xs text-muted-foreground text-center">
            No menu items match "{search}".
          </p>
        )}
      </SidebarContent>
    </Sidebar>
  );
};

export default DashboardSidebar;
