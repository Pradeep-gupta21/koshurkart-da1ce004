import { Link } from "react-router-dom";
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/contexts/CartContext";

const CartPage = () => {
  const { items, removeFromCart, updateQuantity, totalPrice, clearCart } = useCart();

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
        <h1 className="text-2xl font-semibold">Your cart is empty</h1>
        <p className="text-muted-foreground mt-2">Start shopping to add items to your cart.</p>
        <Button className="mt-6" asChild><Link to="/search">Browse Products</Link></Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Shopping Cart ({items.length})</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map(({ product, quantity }) => (
            <div key={product.id} className="bg-card rounded-xl marketplace-shadow p-4 flex gap-4">
              <Link to={`/product/${product.slug}`} className="shrink-0">
                <img src={product.images[0]} alt={product.title} className="h-24 w-24 rounded-lg object-cover" />
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{product.vendorName}</p>
                    <Link to={`/product/${product.slug}`}>
                      <h3 className="text-sm font-medium truncate hover:text-primary transition-colors">{product.title}</h3>
                    </Link>
                  </div>
                  <button onClick={() => removeFromCart(product.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center border rounded-lg">
                    <button className="p-1.5 hover:bg-muted transition-colors" onClick={() => updateQuantity(product.id, quantity - 1)}>
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="px-3 text-sm font-medium tabular-nums">{quantity}</span>
                    <button className="p-1.5 hover:bg-muted transition-colors" onClick={() => updateQuantity(product.id, quantity + 1)}>
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="font-semibold text-primary tabular-nums">
                    ${((product.discountPrice ?? product.price) * quantity).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ))}
          <Button variant="ghost" size="sm" className="text-destructive" onClick={clearCart}>Clear Cart</Button>
        </div>

        {/* Summary */}
        <div className="bg-card rounded-xl marketplace-shadow p-6 h-fit sticky top-24">
          <h2 className="font-semibold mb-4">Order Summary</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">${totalPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span className="text-success font-medium">Free</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span className="tabular-nums">${totalPrice.toFixed(2)}</span>
            </div>
          </div>
          <Button size="lg" className="w-full mt-6 h-12 gap-2" asChild>
            <Link to="/checkout">
              Checkout <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CartPage;
