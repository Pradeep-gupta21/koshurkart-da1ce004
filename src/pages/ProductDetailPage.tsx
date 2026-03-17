import { useParams, Link } from "react-router-dom";
import { Star, ShoppingCart, ChevronRight, CheckCircle, MessageSquare, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import ProductCard from "@/components/product/ProductCard";
import SponsoredProductCard from "@/components/product/SponsoredProductCard";
import ProductGrid from "@/components/product/ProductGrid";
import EmptyState from "@/components/ui/EmptyState";
import { productService } from "@/services/productService";
import { adService } from "@/services/adService";
import { recommendationService } from "@/services/recommendationService";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/types";
import { useCart } from "@/contexts/CartContext";
import { useState, useEffect, useRef } from "react";
import { analyticsService } from "@/services/analyticsService";

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
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const trackedRef = useRef(false);

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => productService.getBySlug(slug!),
    enabled: !!slug,
  });

  // Track product view once
  useEffect(() => {
    if (product?.id && !trackedRef.current) {
      trackedRef.current = true;
      analyticsService.trackEvent('product_view', product.id);
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
        .select('trust_score, is_verified, review_rating')
        .eq('id', product!.vendorId)
        .single();
      return data;
    },
    enabled: !!product?.vendorId,
  });

  const { data: similarProducts = [] } = useQuery({
    queryKey: ['products', 'similar', product?.category, product?.id],
    queryFn: () => productService.getAll({ category: product!.category, limit: 4 }),
    enabled: !!product?.category,
    select: (data) => data.filter(p => p.id !== product?.id).slice(0, 4),
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
        <Link to={`/search?category=${product.category}`} className="hover:text-foreground transition-colors">{product.category}</Link>
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
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-muted-foreground">{product.vendorName}</p>
            {vendorTrust?.is_verified && (
              <Badge className="gap-1 text-[10px] h-5">
                <ShieldCheck className="h-3 w-3" /> Verified Vendor
              </Badge>
            )}
            {vendorTrust?.trust_score != null && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                vendorTrust.trust_score >= 80 ? "text-success bg-success/10" :
                vendorTrust.trust_score >= 60 ? "text-accent bg-accent/10" :
                "text-destructive bg-destructive/10"
              }`}>
                Trust {Math.round(vendorTrust.trust_score)}
              </span>
            )}
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">{product.title}</h1>

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
              ${(product.discountPrice ?? product.price).toFixed(2)}
            </span>
            {product.discountPrice && (
              <>
                <span className="text-lg text-muted-foreground line-through tabular-nums">${product.price.toFixed(2)}</span>
                <span className="text-sm font-semibold text-success">
                  Save {Math.round((1 - product.discountPrice / product.price) * 100)}%
                </span>
              </>
            )}
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
                </div>

                <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex items-center border rounded-lg self-start">
                    <button className="px-3 py-2 hover:bg-muted transition-colors" onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
                    <span className="px-4 py-2 text-sm font-medium tabular-nums">{quantity}</span>
                    <button className="px-3 py-2 hover:bg-muted transition-colors" onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}>+</button>
                  </div>
                  <Button size="lg" className="flex-1 h-12 gap-2" disabled={isOutOfStock} onClick={() => addToCart(product, quantity)}>
                    <ShoppingCart className="h-4 w-4" />
                    {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                  </Button>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Reviews */}
      <section className="mt-14">
        <h2 className="text-xl font-semibold mb-6">Customer Reviews</h2>
        {reviews.length > 0 ? (
          <div className="space-y-4">
            {reviews.map((review: any) => (
              <div key={review.id} className="bg-card rounded-xl marketplace-shadow p-5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{review.profiles?.name || 'Anonymous'}</span>
                    {review.is_verified_purchase && (
                      <span className="text-[10px] font-medium text-success bg-success/10 px-1.5 py-0.5 rounded">Verified</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(review.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex mt-1.5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} className={`h-3 w-3 ${i <= review.rating ? "fill-accent text-accent" : "text-muted"}`} />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mt-2">{review.comment}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={MessageSquare}
            title="No reviews yet"
            description="Be the first to review this product."
            className="py-12"
          />
        )}
      </section>

      {/* Sponsored Suggestions */}
      <SponsoredSuggestionsInline />

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
    </div>
  );
};

export default ProductDetailPage;
