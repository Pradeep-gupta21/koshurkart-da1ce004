import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/hooks/useAuth";
import { orderService } from "@/services/orderService";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Loader2 } from "lucide-react";

const CheckoutPage = () => {
  const { items, totalPrice, clearCart } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isComplete, setIsComplete] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [shipping, setShipping] = useState({
    firstName: "", lastName: "", address: "", city: "", zip: "",
  });

  const handlePlaceOrder = async () => {
    if (!user) return;
    if (!shipping.firstName || !shipping.lastName || !shipping.address || !shipping.city || !shipping.zip) {
      toast({ title: "Missing shipping info", description: "Please fill in all shipping fields.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const order = await orderService.create(user.id, totalPrice);
      await orderService.addItems(
        order.id,
        items.map(({ product, quantity }) => ({
          title: product.title,
          price: product.discountPrice ?? product.price,
          quantity,
          product_id: product.id,
          vendor_id: product.vendorId,
          image: product.images?.[0] ?? "",
        }))
      );
      setOrderId(order.id);
      clearCart();
      setIsComplete(true);
    } catch (err: any) {
      toast({ title: "Order failed", description: err.message ?? "Something went wrong.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (isComplete) {
    return (
      <div className="container mx-auto px-4 py-20 text-center max-w-md">
        <div className="bg-success/10 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="h-10 w-10 text-success" />
        </div>
        <h1 className="text-2xl font-semibold">Order Placed!</h1>
        <p className="text-muted-foreground mt-2">Thank you for your purchase. Your order ID is:</p>
        {orderId && <p className="font-mono text-sm bg-muted px-3 py-1.5 rounded mt-2 inline-block">{orderId.slice(0, 8)}</p>}
        <div className="mt-6 flex gap-3 justify-center">
          <Button asChild><Link to="/profile">View Orders</Link></Button>
          <Button variant="outline" asChild><Link to="/">Continue Shopping</Link></Button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">No items to checkout</h1>
        <Button className="mt-4" asChild><Link to="/search">Browse Products</Link></Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Checkout</h1>

      <div className="grid md:grid-cols-5 gap-8">
        <div className="md:col-span-3 space-y-6">
          <div className="bg-card rounded-xl marketplace-shadow p-6">
            <h2 className="font-semibold mb-4">Shipping Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input placeholder="John" value={shipping.firstName} onChange={e => setShipping(s => ({ ...s, firstName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input placeholder="Doe" value={shipping.lastName} onChange={e => setShipping(s => ({ ...s, lastName: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Address</Label>
                <Input placeholder="123 Main Street" value={shipping.address} onChange={e => setShipping(s => ({ ...s, address: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input placeholder="New York" value={shipping.city} onChange={e => setShipping(s => ({ ...s, city: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Zip Code</Label>
                <Input placeholder="10001" value={shipping.zip} onChange={e => setShipping(s => ({ ...s, zip: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl marketplace-shadow p-6">
            <h2 className="font-semibold mb-4">Payment Method</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Card Number</Label>
                <Input placeholder="4242 4242 4242 4242" />
              </div>
              <div className="space-y-2">
                <Label>Expiry</Label>
                <Input placeholder="MM/YY" />
              </div>
              <div className="space-y-2">
                <Label>CVC</Label>
                <Input placeholder="123" />
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="bg-card rounded-xl marketplace-shadow p-6 sticky top-24">
            <h2 className="font-semibold mb-4">Order Summary</h2>
            <div className="space-y-3 text-sm">
              {items.map(({ product, quantity }) => (
                <div key={product.id} className="flex justify-between">
                  <span className="text-muted-foreground truncate mr-2">{product.title} ×{quantity}</span>
                  <span className="tabular-nums shrink-0">${((product.discountPrice ?? product.price) * quantity).toFixed(2)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="text-success font-medium">Free</span>
              </div>
              <div className="flex justify-between font-semibold text-base">
                <span>Total</span>
                <span className="tabular-nums">${totalPrice.toFixed(2)}</span>
              </div>
            </div>
            <Button
              size="lg"
              className="w-full mt-6 h-12"
              disabled={submitting}
              onClick={handlePlaceOrder}
            >
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</> : `Place Order — $${totalPrice.toFixed(2)}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
