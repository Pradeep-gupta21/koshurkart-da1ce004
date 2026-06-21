import { Link, useNavigate } from "react-router-dom";
import { ShoppingCart, User, Sun, Moon, Mountain, Package, Heart, LogOut } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";
import SearchBar from "@/components/search/SearchBar";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ShopSidebarTrigger from "@/components/navigation/ShopSidebarTrigger";
import LocationPill from "@/components/location/LocationPill";


import { MARKETPLACE_CATEGORIES } from "@/config/categories";

const jkCategories = MARKETPLACE_CATEGORIES;

const actionBtn =
  "hover:bg-accent/10 hover:text-accent transition-all duration-200 hover:-translate-y-0.5";

const Header = () => {
  const { totalItems } = useCart();
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut("global");
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50">
      {/* Main header — glass snow */}
      <div className="bg-background/85 backdrop-blur-md shadow-sm border-b border-border">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <ShopSidebarTrigger />

            {/* Logo with mountain motif */}
            <Link to="/" className="flex items-center gap-2 shrink-0 group">
              <div className="relative h-9 w-9 rounded-lg bg-[hsl(222_47%_11%)] flex items-center justify-center ring-1 ring-accent/40 transition-transform group-hover:scale-105">
                <span className="text-accent font-serif font-bold text-base">K</span>
                <Mountain className="absolute -bottom-1 -right-1 h-3.5 w-3.5 text-accent bg-background rounded-full p-[1px]" strokeWidth={2.5} />
              </div>
              <span className="text-xl font-serif font-semibold tracking-tight hidden sm:inline">
                Koshur <span className="text-accent">Kart</span>
              </span>
            </Link>

            {/* Location — between brand and search */}
            <LocationPill />

            {/* Search */}
            <SearchBar />


            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
                className={`hidden sm:inline-flex ${actionBtn}`}
              >
                {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </Button>
              <NotificationBell />

              {/* Account dropdown — Amazon-style */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`flex items-center gap-2 px-2 h-10 rounded-md ${actionBtn}`}
                    aria-label="Account menu"
                  >
                    <User className="h-5 w-5" />
                    <span className="hidden md:flex flex-col leading-tight text-left">
                      <span className="text-[10px] text-muted-foreground">
                        {user ? "Hello," : "Hello, sign in"}
                      </span>
                      <span className="text-xs font-semibold">Account & Orders</span>
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px] bg-popover/95 backdrop-blur-md">
                  <DropdownMenuLabel className="font-serif">
                    {user ? "Your Account" : "Welcome"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {!user && (
                    <DropdownMenuItem asChild>
                      <Link to="/auth">Sign in</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="flex items-center gap-2">
                      <User className="h-4 w-4" /> Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/profile?tab=orders" className="flex items-center gap-2">
                      <Package className="h-4 w-4" /> Orders
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/profile?tab=wishlist" className="flex items-center gap-2">
                      <Heart className="h-4 w-4" /> Wishlist
                    </Link>
                  </DropdownMenuItem>
                  {user && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleSignOut} className="flex items-center gap-2 text-destructive focus:text-destructive">
                        <LogOut className="h-4 w-4" /> Sign out everywhere
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="ghost" size="icon" className={`relative ${actionBtn}`} asChild>
                <Link to="/cart" aria-label="Cart">
                  <ShoppingCart className="h-5 w-5" />
                  {totalItems > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_hsl(var(--accent)/0.5)]">
                      {totalItems}
                    </span>
                  )}
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Category bar - desktop */}
        <nav className="hidden lg:block border-t border-border">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-1 py-2 overflow-x-auto">
              <Mountain className="h-4 w-4 text-accent mr-2 shrink-0" strokeWidth={2.5} />
              {jkCategories.map((cat) => (
                <Link
                  key={cat.slug}
                  to={`/search?category=${encodeURIComponent(cat.slug)}`}
                  className="text-sm text-muted-foreground hover:text-accent hover:bg-accent/5 px-3 py-1 rounded-md transition-all whitespace-nowrap"
                >
                  {cat.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Header;
