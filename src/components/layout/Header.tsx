import { Link } from "react-router-dom";
import { ShoppingCart, User, Sun, Moon, Globe } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";
import SearchBar from "@/components/search/SearchBar";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useTheme } from "@/hooks/useTheme";
import { useCurrency } from "@/contexts/CurrencyContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { currencyService, CURRENCIES, CurrencyCode } from "@/services/currencyService";
import ShopSidebarTrigger from "@/components/navigation/ShopSidebarTrigger";
import LocationPill from "@/components/location/LocationPill";

const categories = ["Electronics", "Fashion", "Home & Living", "Sports", "Beauty", "Books"];

const Header = () => {
  const { totalItems } = useCart();
  const { theme, toggleTheme } = useTheme();
  const { currency, setCurrency } = useCurrency();
  const currentInfo = CURRENCIES[currency];
  const allCurrencies = currencyService.getSupportedCurrencies();

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      {/* Top bar */}
      <div className="bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 py-1.5 flex items-center justify-between text-xs">
          <span className="hidden sm:inline">Free shipping on orders over $50</span>
          <div className="flex items-center gap-4">
            <LocationPill />
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 hover:underline cursor-pointer">
                <Globe className="h-3 w-3" />
                {currentInfo.flag} {currency}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                {allCurrencies.map(c => (
                  <DropdownMenuItem
                    key={c.code}
                    onClick={() => setCurrency(c.code)}
                    className={currency === c.code ? "bg-accent/20 font-medium" : ""}
                  >
                    <span className="mr-2">{c.flag}</span>
                    {c.code} — {c.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Link to="/vendor" className="hover:underline">Sell on Nexus</Link>
            <Link to="/admin" className="hover:underline">Admin</Link>
          </div>
        </div>
      </div>

      {/* Main header */}
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Sidebar trigger (Amazon-style) */}
          <ShopSidebarTrigger />

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">N</span>
            </div>
            <span className="text-xl font-bold tracking-tight hidden sm:inline">Nexus Market</span>
          </Link>

          {/* Search */}
          <SearchBar />

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="hidden sm:inline-flex">
              {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>
            <NotificationBell />
            <Button variant="ghost" size="icon" asChild>
              <Link to="/profile">
                <User className="h-5 w-5" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" className="relative" asChild>
              <Link to="/cart">
                <ShoppingCart className="h-5 w-5" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Category bar - desktop */}
      <nav className="hidden lg:block border-t">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-6 py-2">
            {categories.map(cat => (
              <Link key={cat} to={`/search?category=${cat}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {cat}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;
