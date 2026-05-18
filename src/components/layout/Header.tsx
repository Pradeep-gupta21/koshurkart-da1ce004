import { Link } from "react-router-dom";
import { ShoppingCart, User, Sun, Moon, Globe, Mountain, Package, Heart } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";
import SearchBar from "@/components/search/SearchBar";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useTheme } from "@/hooks/useTheme";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { currencyService, CURRENCIES } from "@/services/currencyService";
import ShopSidebarTrigger from "@/components/navigation/ShopSidebarTrigger";
import LocationPill from "@/components/location/LocationPill";

const jkCategories = [
  "Pashmina",
  "Saffron",
  "Dry Fruits",
  "Walnut Wood",
  "Papier-mâché",
  "Kahwa",
  "Handicrafts",
  "Carpets",
];

const actionBtn =
  "hover:bg-accent/10 hover:text-accent transition-all duration-200 hover:-translate-y-0.5";

const Header = () => {
  const { totalItems } = useCart();
  const { theme, toggleTheme } = useTheme();
  const { currency, setCurrency } = useCurrency();
  const { user } = useAuth();
  const currentInfo = CURRENCIES[currency];
  const allCurrencies = currencyService.getSupportedCurrencies();

  return (
    <header className="sticky top-0 z-50">
      {/* Top utility bar — glass navy */}
      <div className="bg-[hsl(222_47%_11%)]/90 backdrop-blur-md text-[hsl(210_40%_98%)] shadow-[0_1px_0_hsl(var(--accent)/0.15)]">
        <div className="container mx-auto px-4 py-1.5 flex items-center justify-between text-xs gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <LocationPill />
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <span className="hidden md:inline opacity-80">Free shipping on orders over $50</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 hover:text-accent transition-colors cursor-pointer">
                <Globe className="h-3 w-3" />
                {currentInfo.flag} {currency}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                {allCurrencies.map((c) => (
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
            <Link to="/vendor" className="hover:text-accent transition-colors">Sell on Kashmir</Link>
            <Link to="/admin" className="hover:text-accent transition-colors">Admin</Link>
          </div>
        </div>
      </div>

      {/* Main header — glass snow */}
      <div className="bg-background/80 backdrop-blur-md shadow-sm border-b border-wood/20">
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

            {/* Search */}
            <SearchBar />

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" onClick={toggleTheme} className={`hidden sm:inline-flex ${actionBtn}`}>
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
        <nav className="hidden lg:block border-t border-wood/20">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-1 py-2 overflow-x-auto">
              <Mountain className="h-4 w-4 text-accent mr-2 shrink-0" strokeWidth={2.5} />
              {jkCategories.map((cat) => (
                <Link
                  key={cat}
                  to={`/search?category=${encodeURIComponent(cat)}`}
                  className="text-sm text-muted-foreground hover:text-accent hover:bg-accent/5 px-3 py-1 rounded-md transition-all whitespace-nowrap"
                >
                  {cat}
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
