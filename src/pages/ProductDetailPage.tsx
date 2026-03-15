import { useParams, Link } from "react-router-dom";
import { Star, ShoppingCart, ChevronRight, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import ProductCard from "@/components/product/ProductCard";
import { mockProducts, mockReviews } from "@/data/mock-data";
import { useCart } from "@/contexts/CartContext";
import { useState } from "react";

const ProductDetailPage = () => {
  const { slug } = useParams();
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);

  const product = mockProducts.find(p => p.slug === slug);
  const reviews = mockReviews.filter(r => r.productId === product?.id);
  const similarProducts = mockProducts.filter(p => p.category === product?.category && p.id !== product?.id).slice(0, 4);

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Product Not Found</h1>
        <Button className="mt-4" asChild><Link to="/">Back to Home</Link></Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link to="/" className="hover:text-foreground">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link to={`/search?category=${product.category}`} className="hover:text-foreground">{product.category}</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground">{product.title}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Image */}
        <div className="aspect-square rounded-xl overflow-hidden bg-muted marketplace-shadow">
          <img src={product.images[0]} alt={product.title} className="w-full h-full object-cover" />
        </div>

        {/* Details */}
        <div>
          <p className="text-sm text-muted-foreground">{product.vendorName}</p>
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

          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-success" />
              <span>{product.stock > 0 ? `In Stock (${product.stock} available)` : "Out of Stock"}</span>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <div className="flex items-center border rounded-lg">
              <button className="px-3 py-2 hover:bg-muted transition-colors" onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
              <span className="px-4 py-2 text-sm font-medium tabular-nums">{quantity}</span>
              <button className="px-3 py-2 hover:bg-muted transition-colors" onClick={() => setQuantity(quantity + 1)}>+</button>
            </div>
            <Button size="lg" className="flex-1 h-12 gap-2" onClick={() => addToCart(product, quantity)}>
              <ShoppingCart className="h-4 w-4" />
              Add to Cart
            </Button>
          </div>
        </div>
      </div>

      {/* Reviews */}
      <section className="mt-14">
        <h2 className="text-xl font-semibold mb-6">Customer Reviews</h2>
        {reviews.length > 0 ? (
          <div className="space-y-4">
            {reviews.map(review => (
              <div key={review.id} className="bg-card rounded-xl marketplace-shadow p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{review.userName}</span>
                    {review.isVerifiedPurchase && (
                      <span className="text-[10px] font-medium text-success bg-success/10 px-1.5 py-0.5 rounded">Verified</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleDateString()}</span>
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
          <p className="text-sm text-muted-foreground">No reviews yet for this product.</p>
        )}
      </section>

      {/* Similar Sponsored Products */}
      {similarProducts.length > 0 && (
        <section className="mt-14">
          <h2 className="text-xl font-semibold mb-6">Similar Products</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {similarProducts.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ProductDetailPage;
