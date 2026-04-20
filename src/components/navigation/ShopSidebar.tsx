import { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sun, Moon, LogOut, AlertCircle } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useShopperNavigation, useAuthLoading } from "@/hooks/useNavigation";
import { useSidebar } from "@/contexts/SidebarContext";
import { sidebarMenuService } from "@/services/sidebarMenuService";
import SidebarSection from "./SidebarSection";
import SidebarHeader from "./SidebarHeader";
import SidebarItem from "./SidebarItem";
import ExpandableMenu from "./ExpandableMenu";
import SidebarSkeleton from "./SidebarSkeleton";
import EmptyState from "@/components/ui/EmptyState";

const ShopSidebar = () => {
  const { isOpen, close } = useSidebar();
  const { user, roles, signOut } = useAuth();
  const authLoading = useAuthLoading();
  const { theme, toggleTheme } = useTheme();
  const sections = useShopperNavigation();
  const location = useLocation();

  // Close on route change
  useEffect(() => {
    if (isOpen) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  // Cache key includes roles so menu refreshes instantly on sign-in/out
  const rolesKey = useMemo(
    () => (user ? [...roles].sort().join(",") || "user" : "guest"),
    [user, roles],
  );

  // Lazy fetch — only when opened AND auth resolved
  const { data: menu, isLoading, isError, refetch } = useQuery({
    queryKey: ["sidebar-menu", "shop", rolesKey],
    queryFn: () => sidebarMenuService.fetchMenu("shop"),
    enabled: isOpen && !authLoading,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });

  const accountSections = sections.filter(
    (s) => s.id === "account" || s.id === "sell" || s.id === "help",
  );

  const showSkeleton = authLoading || (isLoading && !menu);

  return (
    <Sheet open={isOpen} onOpenChange={(v) => (v ? null : close())}>
      <SheetContent
        side="left"
        className="w-[320px] sm:w-[360px] p-0 flex flex-col gap-0"
        aria-label="Main navigation"
      >
        <SheetTitle className="sr-only">Main navigation</SheetTitle>
        <SheetDescription className="sr-only">
          Browse departments, trending products, your account and settings
        </SheetDescription>

        <SidebarHeader />

        <nav className="flex-1 overflow-y-auto" aria-label="Main">
          {showSkeleton ? (
            <SidebarSkeleton />
          ) : isError ? (
            <>
              <EmptyState
                icon={AlertCircle}
                title="Couldn't load menu"
                description="We'll show your basic options below. Tap retry to try again."
                actionLabel="Retry"
                onAction={() => refetch()}
                className="py-10"
              />
              {/* Fallback to static role-based sections so drawer is never empty */}
              {sections.map((section) => (
                <SidebarSection key={section.id} label={section.label}>
                  <ul role="list">
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <SidebarItem
                          to={item.to ?? "#"}
                          label={item.label}
                          icon={item.icon}
                          end={item.end}
                        />
                      </li>
                    ))}
                  </ul>
                </SidebarSection>
              ))}
            </>
          ) : (
            <>
              {/* Trending */}
              {menu?.trending && menu.trending.length > 0 && (
                <SidebarSection label="Trending Now">
                  <div className="px-4 pb-2 flex gap-3 overflow-x-auto scrollbar-thin">
                    {menu.trending.map((p) => (
                      <Link
                        key={p.id}
                        to={`/product/${p.slug}`}
                        className="flex-shrink-0 w-24 group"
                      >
                        <div className="aspect-square rounded-md overflow-hidden bg-muted mb-1.5">
                          {p.image ? (
                            <img
                              src={p.image}
                              alt={p.title}
                              loading="lazy"
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="h-full w-full bg-muted" />
                          )}
                        </div>
                        <p className="text-xs line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                          {p.title}
                        </p>
                      </Link>
                    ))}
                  </div>
                </SidebarSection>
              )}

              {/* Admin-managed dynamic tree */}
              {menu?.tree && menu.tree.length > 0 && (
                <SidebarSection label="Browse">
                  <div role="tree">
                    {menu.tree.map((node) => (
                      <ExpandableMenu key={node.id} node={node} />
                    ))}
                  </div>
                </SidebarSection>
              )}

              {/* Auth / Account / Sell / Help (config-driven, role-aware) */}
              {accountSections.map((section) => (
                <SidebarSection key={section.id} label={section.label}>
                  <ul role="list">
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <SidebarItem
                          to={item.to ?? "#"}
                          label={item.label}
                          icon={item.icon}
                          end={item.end}
                        />
                      </li>
                    ))}
                  </ul>
                </SidebarSection>
              ))}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t p-3 space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="w-full justify-start gap-3"
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {theme === "light" ? "Dark Mode" : "Light Mode"}
          </Button>
          {user && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                close();
              }}
              className="w-full justify-start gap-3 text-destructive hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ShopSidebar;
