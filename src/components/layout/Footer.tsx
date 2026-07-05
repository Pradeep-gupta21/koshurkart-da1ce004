import { Link } from "react-router-dom";
import { Instagram, Linkedin, Facebook } from "lucide-react";

const Footer = () => (
  <footer className="bg-[hsl(222_47%_11%)] text-[hsl(210_40%_98%)] mt-16 border-t border-wood">
    <div className="container mx-auto px-4 py-12">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-9 w-9 rounded-lg bg-background/5 ring-1 ring-accent/40 flex items-center justify-center">
              <span className="text-accent font-serif font-bold text-base">K</span>
            </div>
            <span className="text-lg font-serif font-semibold">
              Koshur <span className="text-accent">Kart</span>
            </span>
          </div>
          <p className="text-sm opacity-70 leading-relaxed">
            Authentic crafts and goods from the valley — Pashmina, walnut wood, saffron and more, delivered with care.
          </p>
        </div>
        <div>
          <h4 className="font-sans font-semibold mb-3 text-sm tracking-wide uppercase text-accent/90">Shop</h4>
          <nav className="flex flex-col gap-2 text-sm opacity-70">
            <Link to="/search" className="hover:text-accent hover:opacity-100 transition-colors">All Products</Link>
            <Link to="/search?category=pashmina" className="hover:text-accent hover:opacity-100 transition-colors">Pashmina</Link>
            <Link to="/search?category=saffron" className="hover:text-accent hover:opacity-100 transition-colors">Saffron</Link>
            <Link to="/search?category=dry_fruits" className="hover:text-accent hover:opacity-100 transition-colors">Dry Fruits</Link>
          </nav>
        </div>
        <div>
          <h4 className="font-sans font-semibold mb-3 text-sm tracking-wide uppercase text-accent/90">Sell</h4>
          <nav className="flex flex-col gap-2 text-sm opacity-70">
            <Link to="/vendor" className="hover:text-accent hover:opacity-100 transition-colors">Vendor Dashboard</Link>
            <Link to="/vendor" className="hover:text-accent hover:opacity-100 transition-colors">Start Selling</Link>
            <Link to="/vendor" className="hover:text-accent hover:opacity-100 transition-colors">Advertising</Link>
          </nav>
        </div>
        <div>
          <h4 className="font-sans font-semibold mb-3 text-sm tracking-wide uppercase text-accent/90">Support</h4>
          <nav className="flex flex-col gap-2 text-sm opacity-70">
            <Link to="/support" className="hover:text-accent hover:opacity-100 transition-colors">Support</Link>
            <span>Help Center</span>
            <span>Contact Us</span>
            <Link to="/about-us" className="hover:text-accent hover:opacity-100 transition-colors">About Us</Link>
            <Link to="/refund-return-policy" className="hover:text-accent hover:opacity-100 transition-colors">Returns &amp; Refunds</Link>
            <Link to="/privacy-policy" className="hover:text-accent hover:opacity-100 transition-colors">Privacy Policy</Link>
            <Link to="/terms-and-conditions" className="hover:text-accent hover:opacity-100 transition-colors">Terms &amp; Conditions</Link>
          </nav>
        </div>
      </div>
      <div className="mt-12 pt-6 border-t border-wood flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm opacity-50">© 2026 Koshur Kart. Crafted in the valley.</p>
        <div className="flex items-center gap-4">
          <a
            href="https://www.instagram.com/koshurkart?igsh=MTh2MWE2cHgxaG1iYQ=="
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow Koshur Kart on Instagram"
            className="opacity-70 hover:opacity-100 hover:text-accent transition-opacity duration-200"
          >
            <Instagram className="h-5 w-5" />
          </a>
          <a
            href="https://www.linkedin.com/company/koshur-kart/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow Koshur Kart on LinkedIn"
            className="opacity-70 hover:opacity-100 hover:text-accent transition-opacity duration-200"
          >
            <Linkedin className="h-5 w-5" />
          </a>
          <a
            href="https://www.facebook.com/share/1GHhHvadZj/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow Koshur Kart on Facebook"
            className="opacity-70 hover:opacity-100 hover:text-accent transition-opacity duration-200"
          >
            <Facebook className="h-5 w-5" />
          </a>
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
