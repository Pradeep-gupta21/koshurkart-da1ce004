import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

const setDocumentMeta = (title: string, description: string) => {
  if (typeof document === "undefined") return;
  document.title = title;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "description";
    document.head.appendChild(meta);
  }
  meta.content = description;
};
import { supabase } from "@/integrations/supabase/client";
import { VENDOR_PUBLIC_COLUMNS } from "@/services/vendorService";
import { mapDbProduct } from "@/services/productService";
import type { Product } from "@/types";
import ProductCard from "@/components/product/ProductCard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, ShieldCheck, Star, Store, Package, Search, X } from "lucide-react";
import FromKashmirBadge from "@/components/product/FromKashmirBadge";
import VerifiedLocalSellerBadge from "@/components/product/VerifiedLocalSellerBadge";
import { isKashmirVendor, isVerifiedLocalSeller } from "@/lib/regionUtils";

/**
 * Public, dynamically-routed vendor storefront. Accessible at /store/:slug.
 * Shows only the matched vendor's branding and their active product catalog.
 */
const VendorStorePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [vendor, setVendor] = useState<any | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setQuery("");

    (async () => {
      const { data: vendorRow, error } = await supabase
        .from("vendors")
        .select(VENDOR_PUBLIC_COLUMNS)
        .eq("store_slug", slug)
        .maybeSingle();

      if (cancelled) return;
      if (error || !vendorRow) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setVendor(vendorRow);

      const { data: prodRows } = await supabase
        .from("products")
        .select("*, vendors(store_name, pickup_state)")
        .eq("vendor_id", (vendorRow as any).id)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      setProducts((prodRows ?? []).map((r: any) => mapDbProduct(r)));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const filteredProducts = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return products;
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(text) ||
        p.description.toLowerCase().includes(text),
    );
  }, [products, query]);

  const verified = vendor?.is_verified || vendor?.verification_status === "verified";

  if (loading) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (notFound || !vendor) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-20 text-center space-y-4">
        <Store className="h-12 w-12 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-bold">Storefront not found</h1>
        <p className="text-muted-foreground">
          We couldn't find a store at <code className="font-mono">/store/{slug}</code>.
        </p>
        <Button asChild>
          <Link to="/">Back to marketplace</Link>
        </Button>
      </div>
    );
  }

  const localityLike = {
    pickup_state: vendor.pickup_state,
    verification_status: vendor.verification_status,
    kyc_status: "approved",
  };

  if (vendor) {
    setDocumentMeta(
      `${vendor.store_name} | Koshur Kart Storefront`,
      vendor.description?.slice(0, 155) ??
        `Shop authentic products from ${vendor.store_name} on Koshur Kart.`,
    );
  }

  return (
    <>

      {/* Banner */}
      <div className="relative w-full">
        <div
          className="h-40 sm:h-56 w-full bg-gradient-to-br from-primary/20 via-secondary/15 to-accent/10 bg-cover bg-center"
          style={vendor.banner ? { backgroundImage: `url(${vendor.banner})` } : undefined}
          aria-hidden
        />
        <div className="container mx-auto max-w-7xl px-4">
          <div className="-mt-12 sm:-mt-16 relative z-10 flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
            <div className="h-24 w-24 sm:h-32 sm:w-32 rounded-2xl border-4 border-background bg-card shadow-lg overflow-hidden shrink-0 flex items-center justify-center">
              {vendor.logo ? (
                <img src={vendor.logo} alt={`${vendor.store_name} logo`} className="h-full w-full object-cover" />
              ) : (
                <Store className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0 pb-1 sm:pb-2">
              <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 flex-wrap">
                {vendor.store_name}
                {verified && (
                  <Badge className="gap-1">
                    <ShieldCheck className="h-3 w-3" /> Verified
                  </Badge>
                )}
              </h1>
              {vendor.tagline && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{vendor.tagline}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                {(vendor.pickup_city || vendor.pickup_state) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {[vendor.pickup_city, vendor.pickup_state].filter(Boolean).join(", ")}
                  </span>
                )}
                {Number(vendor.review_rating ?? vendor.rating ?? 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-accent text-accent" />
                    {Number(vendor.review_rating ?? vendor.rating).toFixed(1)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Package className="h-4 w-4" />
                  {products.length} {products.length === 1 ? "product" : "products"}
                </span>
                {isKashmirVendor(localityLike) && <FromKashmirBadge />}
                {isVerifiedLocalSeller(localityLike) && <VerifiedLocalSellerBadge />}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
        {vendor.description && (
          <Card className="marketplace-shadow">
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                About the store
              </h2>
              <p className="text-sm leading-relaxed whitespace-pre-line">{vendor.description}</p>
            </CardContent>
          </Card>
        )}

        {/* In-Store Search */}
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items in this store..."
            className="h-11 w-full rounded-lg bg-card pl-10 pr-10 text-sm shadow-sm transition-all focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-0 focus-visible:border-accent"
            aria-label="Search items in this store"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div>
          <h2 className="text-xl font-bold mb-4">Products</h2>
          {products.length === 0 ? (
            <Card className="marketplace-shadow">
              <CardContent className="p-10 text-center text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>This store hasn't listed any products yet. Check back soon!</p>
              </CardContent>
            </Card>
          ) : filteredProducts.length === 0 ? (
            <Card className="marketplace-shadow">
              <CardContent className="p-10 text-center text-muted-foreground">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">
                  No items matching "<span className="font-medium text-foreground">{query.trim()}</span>" found in this store.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default VendorStorePage;
