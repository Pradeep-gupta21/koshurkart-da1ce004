import { useParams, Link, useNavigate } from "react-router-dom";
import { Star, ShoppingCart, ChevronRight, CheckCircle, MessageSquare, ShieldCheck, Mountain, Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import ProductCard from "@/components/product/ProductCard";
import WishlistButton from "@/components/product/WishlistButton";
import SponsoredProductCard from "@/components/product/SponsoredProductCard";
import ProductGrid from "@/components/product/ProductGrid";
import EmptyState from "@/components/ui/EmptyState";
import { ServiceFactory } from "@/services/commerce/di/ServiceFactory";
import { formatCategoryLabel } from "@/config/categories";
import { adService } from "@/services/adService";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/types";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useState, useEffect, useRef } from "react";
import { analyticsService } from "@/services/analyticsService";
import ReviewSection from "@/components/reviews/ReviewSection";
import ServiceabilityBadge from "@/components/location/ServiceabilityBadge";
import LocationDialog from "@/components/location/LocationDialog";
import FromKashmirBadge from "@/components/product/FromKashmirBadge";
import VerifiedLocalSellerBadge from "@/components/product/VerifiedLocalSellerBadge";
import { isKashmirVendor, isVerifiedLocalSeller } from "@/lib/regionUtils";
import { useLocation as useUserLocation } from "@/contexts/LocationContext";

const mapCampaignToProduct = (c: any): Product & { campaignId: string } => {
  const p = c.products;
  return {
    campaignId: c.id,
    id: p.id,
    title: p.title,
    slug: p.slug,
    price: Number(p.price),
    discountPrice: p.discount_price ? Number(p.discount_price) : undefined,
    images: p.images ?? [],
    rating: Number(p.rating ?? 0),
    reviewCount: p.review_count ?? 0,
    category: p.category,
    vendorId: p.vendor_id,
    vendorName: p.vendors?.store_name ?? "",
    stock: 0,
    reservedStock: 0,
    lowStockThreshold: 5,
    description: "",
    status: "active",
    isSponsored: true,
    createdAt: c.created_at ?? "",
    salesCount: 0,
    viewCount: 0,
    trendingScore: 0,
  };
};

const SponsoredSuggestionsInline = () => {
  const { data: campaigns = [] } = useQuery({
    queryKey: ['ads', 'product'],
    queryFn: () => adService.getApprovedByPlacement('product'),
  });
  const ads = campaigns.filter((c: any) => c.products).map(mapCampaignToProduct);
  if (ads.length === 0) return null;
  return (
    <section className="mt-14">
      <h2 className="text-xl font-semibold mb-6">Sponsored Suggestions</h2>
      <ProductGrid>
        {ads.slice(0, 4).map(ad => (
          <SponsoredProductCard key={ad.campaignId} product={ad} campaignId={ad.campaignId} />
        ))}
      </ProductGrid>
    </section>
  );
};

/* Loading skeleton for the detail page */
const DetailSkeleton = () => (
  <div className="container mx-auto px-4 py-6 animate-fade-in">
    <div className="h-4 w-64 rounded-md shimmer mb-6" />
    <div className="grid md:grid-cols-2 gap-8">
      <div className="aspect-square rounded-xl shimmer" />
      <div className="space-y-4">
        <div className="h-4 w-32 rounded-md shimmer" />
        <div className="h-8 w-3/4 rounded-md shimmer" />
        <div className="h-4 w-40 rounded-md shimmer" />
        <div className="h-10 w-48 rounded-md shimmer" />
        <div className="h-20 w-full rounded-md shimmer" />
      </div>
    </div>
  </div>
);

const ProductDetailPage = () => {
  const { slug } = useParams();
  const { addToCart, startBuyNow } = useCart();
  const navigate = useNavigate();

  const { formatPrice } = useCurrency();
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const { location: userLocation } = useUserLocation();
  const trackedRef = useRef(false);

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', slug],
    queryFn: async () => {
      const result = await ServiceFactory.getProductService().getBySlug(slug!);
      if (!result.success) throw new Error((result as any).error?.message || "Error");
      return result.data;
    },
    enabled: !!slug,
  });

  // Track product view once
  useEffect(() => {
    if (product?.id && !trackedRef.current) {
      trackedRef.current = true;
      analyticsService.trackEvent('product_view', product.id);
      // Mirror to local store so the "Recently Viewed" rail works for guests
      // and as a fast cache for authenticated users.
      import('@/lib/recentlyViewedStore').then(({ recentlyViewedStore }) => {
        recentlyViewedStore.push(product.id);
      });
    }
  }, [product?.id]);

  const { data: reviews = [] } = useQuery({
    queryKey: ['reviews', product?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('reviews')
        .select('*, profiles(name)')
        .eq('product_id', product!.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!product?.id,
  });

  const { data: vendorTrust } = useQuery({
    queryKey: ['vendor-trust', product?.vendorId],
    queryFn: async () => {
      const { data } = await supabase
        .from('vendors')
        .select('trust_score, is_verified, review_rating, pickup_state, verification_status')
        .eq('id', product!.vendorId)
        .single();
      return data;
    },
    enabled: !!product?.vendorId,
  });

  const { data: similarProducts = [] } = useQuery({
    queryKey: ['products', 'ai-similar', product?.id],
    queryFn: async () => {
      const result = await ServiceFactory.getRecommendationService().getScoredSimilarProducts(product!.id, 4);
      if (!result.success) throw new Error((result as any).error?.message || "Error");
      return result.data;
    },
    enabled: !!product?.id,
  });

  const { data: boughtTogether = [] } = useQuery({
    queryKey: ['products', 'bought-together', product?.id],
    queryFn: async () => {
      const result = await ServiceFactory.getRecommendationService().getFrequentlyBoughtTogether(product!.id, 4);
      if (!result.success) throw new Error((result as any).error?.message || "Error");
      return result.data;
    },
    enabled: !!product?.id,
  });

  if (isLoading) return <DetailSkeleton />;

  if (error || !product) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Product Not Found</h1>
        <Button className="mt-4" asChild><Link to="/">Back to Home</Link></Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 animate-fade-in">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link to={`/search?category=${encodeURIComponent(product.category)}`} className="hover:text-foreground transition-colors">{formatCategoryLabel(product.category)}</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground truncate max-w-[200px]">{product.title}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Images */}
        <div className="space-y-3">
          <div className="aspect-square rounded-xl overflow-hidden bg-muted marketplace-shadow">
            <img src={product.images[selectedImage] || '/placeholder.svg'} alt={product.title} className="w-full h-full object-cover" />
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={`h-16 w-16 rounded-lg overflow-hidden border-2 shrink-0 transition-colors ${i === selectedImage ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'}`}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          {/* Vendor card */}
          <div className="rounded-xl border border-wood bg-card p-3 flex items-center gap-3 marketplace-shadow">
            <div className="h-10 w-10 rounded-full bg-accent/15 text-accent flex items-center justify-center font-serif font-semibold">
              {product.vendorName?.[0] ?? "K"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold truncate">{product.vendorName}</p>
                {vendorTrust?.is_verified && <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
                {isKashmirVendor(vendorTrust) && <FromKashmirBadge />}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {vendorTrust?.trust_score != null && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    vendorTrust.trust_score >= 80 ? "text-success bg-success/10" :
                    vendorTrust.trust_score >= 60 ? "text-accent bg-accent/10" :
                    "text-destructive bg-destructive/10"
                  }`}>
                    Trust {Math.round(vendorTrust.trust_score)}
                  </span>
                )}
                <Link to={`/search?vendor=${product.vendorId}`} className="text-[11px] font-medium text-primary hover:underline">
                  View store →
                </Link>
              </div>
            </div>
          </div>

          <h1 className="text-2xl md:text-3xl font-serif font-semibold tracking-tight mt-4">{product.title}</h1>

          <div className="flex items-center gap-2 mt-3">
            <div className="flex">
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} className={`h-4 w-4 ${i <= Math.round(product.rating) ? "fill-accent text-accent" : "text-muted"}`} />
              ))}
            </div>
            <span className="text-sm font-medium">{product.rating}</span>
            <span className="text-sm text-muted-foreground">({product.reviewCount} reviews)</span>
          </div>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-3xl font-bold text-primary tabular-nums">
              {formatPrice(product.discountPrice ?? product.price)}
            </span>
            {product.discountPrice && (
              <>
                <span className="text-lg text-muted-foreground line-through tabular-nums">{formatPrice(product.price)}</span>
                <span className="text-sm font-semibold text-success">
                  Save {Math.round((1 - product.discountPrice / product.price) * 100)}%
                </span>
              </>
            )}
          </div>

          {isVerifiedLocalSeller(vendorTrust) && (
            <div className="mt-3">
              <VerifiedLocalSellerBadge />
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1 text-[10px] h-6 text-accent border-accent/40 bg-accent/5">
              <Mountain className="h-3 w-3" /> Authentic Kashmiri Product
            </Badge>
            {vendorTrust?.is_verified && (
              <Badge variant="outline" className="gap-1 text-[10px] h-6 text-primary border-primary/30 bg-primary/5">
                <ShieldCheck className="h-3 w-3" /> Verified Artisan
              </Badge>
            )}
            <Badge variant="outline" className="gap-1 text-[10px] h-6 text-success border-success/30 bg-success/5">
              <Truck className="h-3 w-3" /> Secure Delivery
            </Badge>
          </div>

          <Separator className="my-6" />

          <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>

          {(() => {
            const availableStock = product.stock - (product.reservedStock ?? 0);
            const isOutOfStock = availableStock <= 0;
            const isLowStock = !isOutOfStock && availableStock <= (product.lowStockThreshold ?? 5);
            return (
              <>
                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    {isOutOfStock ? (
                      <>
                        <span className="h-4 w-4 rounded-full bg-destructive" />
                        <span className="text-destructive font-medium">Out of Stock</span>
                      </>
                    ) : isLowStock ? (
                      <>
                        <span className="h-4 w-4 rounded-full bg-destructive/60" />
                        <span className="text-destructive/80 font-medium">Low Stock — Only {availableStock} left</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span>In Stock ({availableStock} available)</span>
                      </>
                    )}
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between gap-3 flex-wrap">
                    <ServiceabilityBadge productId={product.id} variant="full" />
                    <button
                      type="button"
                      onClick={() => setLocationDialogOpen(true)}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      {userLocation?.pincode ? "Change location" : "Set location"}
                    </button>
                  </div>
                </div>

                <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex items-center border rounded-lg self-start">
                    <button className="px-3 py-2 hover:bg-muted transition-colors" onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
                    <span className="px-4 py-2 text-sm font-medium tabular-nums">{quantity}</span>
                    <button className="px-3 py-2 hover:bg-muted transition-colors" onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}>+</button>
                  </div>
                  <div className="flex-1 flex flex-col gap-3">
                    <Button
                      size="lg"
                      className="w-full h-12 gap-2 bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm"
                      disabled={isOutOfStock}
                      onClick={() => {
                        startBuyNow(product, quantity);
                        navigate('/checkout');
                      }}
                    >
                      {isOutOfStock ? "Out of Stock" : "Buy Now"}
                    </Button>
                    <Button size="lg" className="w-full h-12 gap-2" disabled={isOutOfStock} onClick={() => addToCart(product, quantity)}>
                      <ShoppingCart className="h-4 w-4" />
                      {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                    </Button>
                  </div>
                  <WishlistButton
                    productId={product.id}
                    vendorId={product.vendorId}
                    category={product.category}
                    variant="inline"
                  />
                </div>


              </>
            );
          })()}
        </div>
      </div>

      {/* Reviews */}
      <ReviewSection productId={product.id} />

      {/* Sponsored Suggestions */}
      <SponsoredSuggestionsInline />

      {/* Frequently Bought Together */}
      {boughtTogether.length > 0 && (
        <section className="mt-14">
          <h2 className="text-xl font-semibold mb-6">Frequently Bought Together</h2>
          <ProductGrid>
            {boughtTogether.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </ProductGrid>
        </section>
      )}

      {/* Similar */}
      {similarProducts.length > 0 && (
        <section className="mt-14 pb-8">
          <h2 className="text-xl font-semibold mb-6">Similar Products</h2>
          <ProductGrid>
            {similarProducts.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </ProductGrid>
        </section>
      )}

      <LocationDialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen} />
    </div>
  );
};

export default ProductDetailPage;
