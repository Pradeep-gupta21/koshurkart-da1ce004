import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Sun, Moon, LogOut, User as UserIcon } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useShopperNavigation } from "@/hooks/useNavigation";
import SidebarSection from "./SidebarSection";

interface ShopSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ShopSidebar = ({ open, onOpenChange }: ShopSidebarProps) => {
  const sections = useShopperNavigation();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  // Close on route change
  useEffect(() => {
    if (open) onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  const displayName = (user?.user_metadata?.name as string) || user?.email?.split("@")[0] || "";
  const initial = displayName.charAt(0).toUpperCase() || "G";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[320px] p-0 flex flex-col">
        {/* Header */}
        <div className="bg-primary text-primary-foreground px-5 py-5">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-primary-foreground/20">
              <AvatarFallback className="bg-primary-foreground/10 text-primary-foreground font-semibold">
                {user ? initial : <UserIcon className="h-5 w-5" />}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-xs opacity-80">{user ? "Hello," : "Welcome"}</p>
              <p className="font-semibold truncate">
                {user ? displayName : "Sign in for the best experience"}
              </p>
            </div>
          </div>
        </div>

        {/* Sections */}
        <nav className="flex-1 overflow-y-auto">
          {sections.map((section) => (
            <SidebarSection key={section.id} label={section.label}>
              <ul>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <Link
                        to={item.to ?? "#"}
                        className="flex items-center gap-3 px-5 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </SidebarSection>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t p-3 space-y-1">
          <Button variant="ghost" size="sm" onClick={toggleTheme} className="w-full justify-start gap-3">
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {theme === "light" ? "Dark Mode" : "Light Mode"}
          </Button>
          {user && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
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
