import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useAuth } from "@/hooks/useAuth";
import { orderService } from "@/services/orderService";
import { paymentService } from "@/services/paymentService";
import { analyticsService } from "@/services/analyticsService";
import { inventoryService } from "@/services/inventoryService";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Loader2, CreditCard, Smartphone, Building2, Wallet, Banknote } from "lucide-react";

const PAYMENT_METHODS = [
  { value: "card", label: "Credit/Debit Card", icon: CreditCard },
  { value: "upi", label: "UPI", icon: Smartphone },
  { value: "netbanking", label: "Net Banking", icon: Building2 },
  { value: "wallet", label: "Wallet", icon: Wallet },
  { value: "cod", label: "Cash on Delivery", icon: Banknote },
] as const;

const CheckoutPage = () => {
  const { items, totalPrice, clearCart } = useCart();
  const { formatPrice } = useCurrency();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isComplete, setIsComplete] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("card");

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
    const reservedItems: { productId: string; quantity: number }[] = [];

    try {
      for (const { product, quantity } of items) {
        await inventoryService.reserveStock(product.id, quantity);
        reservedItems.push({ productId: product.id, quantity });
      }

      // Orders are always stored in USD
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

      // Create payment record
      await paymentService.createPayment(user.id, order.id, totalPrice, paymentMethod);

      for (const { productId, quantity } of reservedItems) {
        await inventoryService.confirmStock(productId, quantity);
      }

      for (const { product, quantity } of items) {
        analyticsService.trackEvent('purchase', product.id, undefined, { quantity, price: product.discountPrice ?? product.price });
      }

      setOrderId(order.id);
      clearCart();
      setIsComplete(true);
    } catch (err: any) {
      for (const { productId, quantity } of reservedItems) {
        try { await inventoryService.releaseStock(productId, quantity); } catch (_) {}
      }
      const msg = err.message?.includes('Insufficient stock') ? err.message : err.message ?? "Something went wrong.";
      toast({ title: "Order failed", description: msg, variant: "destructive" });
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
        <p className="text-sm text-muted-foreground mt-2">
          Payment: <span className="font-medium capitalize">{paymentMethod}</span>
          {paymentMethod === 'cod' ? ' — Pay on delivery' : ' — Paid'}
        </p>
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
            <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="space-y-3">
              {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    paymentMethod === value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value={value} />
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{label}</span>
                </label>
              ))}
            </RadioGroup>

            {paymentMethod === 'card' && (
              <div className="grid grid-cols-2 gap-4 mt-4">
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
            )}
            {paymentMethod === 'upi' && (
              <div className="mt-4 space-y-2">
                <Label>UPI ID</Label>
                <Input placeholder="yourname@upi" />
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="bg-card rounded-xl marketplace-shadow p-6 sticky top-24">
            <h2 className="font-semibold mb-4">Order Summary</h2>
            <div className="space-y-3 text-sm">
              {items.map(({ product, quantity }) => (
                <div key={product.id} className="flex justify-between">
                  <span className="text-muted-foreground truncate mr-2">{product.title} ×{quantity}</span>
                  <span className="tabular-nums shrink-0">{formatPrice((product.discountPrice ?? product.price) * quantity)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="text-success font-medium">Free</span>
              </div>
              <div className="flex justify-between font-semibold text-base">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(totalPrice)}</span>
              </div>
            </div>
            <Button
              size="lg"
              className="w-full mt-6 h-12"
              disabled={submitting}
              onClick={handlePlaceOrder}
            >
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</> : `Place Order — ${formatPrice(totalPrice)}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
