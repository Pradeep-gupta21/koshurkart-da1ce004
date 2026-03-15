import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="bg-foreground text-background mt-16">
    <div className="container mx-auto px-4 py-12">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">N</span>
            </div>
            <span className="text-lg font-bold">Nexus Market</span>
          </div>
          <p className="text-sm opacity-60">The premium multi-vendor marketplace for modern shopping.</p>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-sm">Shop</h4>
          <nav className="flex flex-col gap-2 text-sm opacity-60">
            <Link to="/search" className="hover:opacity-100 transition-opacity">All Products</Link>
            <Link to="/search?category=Electronics" className="hover:opacity-100 transition-opacity">Electronics</Link>
            <Link to="/search?category=Fashion" className="hover:opacity-100 transition-opacity">Fashion</Link>
            <Link to="/search?category=Home" className="hover:opacity-100 transition-opacity">Home & Living</Link>
          </nav>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-sm">Sell</h4>
          <nav className="flex flex-col gap-2 text-sm opacity-60">
            <Link to="/vendor" className="hover:opacity-100 transition-opacity">Vendor Dashboard</Link>
            <Link to="/vendor" className="hover:opacity-100 transition-opacity">Start Selling</Link>
            <Link to="/vendor" className="hover:opacity-100 transition-opacity">Advertising</Link>
          </nav>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-sm">Support</h4>
          <nav className="flex flex-col gap-2 text-sm opacity-60">
            <span>Help Center</span>
            <span>Contact Us</span>
            <span>Returns</span>
          </nav>
        </div>
      </div>
      <div className="mt-12 pt-6 border-t border-background/10 text-sm opacity-40 text-center">
        © 2026 Nexus Market. All rights reserved.
      </div>
    </div>
  </footer>
);

export default Footer;
