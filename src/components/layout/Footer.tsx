import { Link } from "react-router-dom";

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
              Kashmir <span className="text-accent">Bazaar</span>
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
            <Link to="/search?category=Electronics" className="hover:text-accent hover:opacity-100 transition-colors">Electronics</Link>
            <Link to="/search?category=Fashion" className="hover:text-accent hover:opacity-100 transition-colors">Fashion</Link>
            <Link to="/search?category=Home" className="hover:text-accent hover:opacity-100 transition-colors">Home & Living</Link>
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
            <span>Help Center</span>
            <span>Contact Us</span>
            <span>Returns</span>
          </nav>
        </div>
      </div>
      <div className="mt-12 pt-6 border-t border-wood text-sm opacity-50 text-center">
        © 2026 Kashmir Bazaar. Crafted in the valley.
      </div>
    </div>
  </footer>
);

export default Footer;
