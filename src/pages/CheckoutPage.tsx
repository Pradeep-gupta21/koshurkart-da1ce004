import { useState, useRef } from "react";
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
import { platformSettings } from "@/config/platformSettings";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Loader2, CreditCard, Smartphone, Building2, Wallet, Banknote, XCircle, Upload, QrCode } from "lucide-react";

const PAYMENT_METHODS = [
  { value: "card", label: "Credit/Debit Card", icon: CreditCard },
  { value: "upi", label: "UPI", icon: Smartphone },
  { value: "razorpay", label: "Razorpay", icon: CreditCard },
  { value: "netbanking", label: "Net Banking", icon: Building2 },
  { value: "wallet", label: "Wallet", icon: Wallet },
  { value: "cod", label: "Cash on Delivery", icon: Banknote },
] as const;

type FlowState = "form" | "processing" | "success" | "failed" | "upi_pending" | "razorpay_pending";

const CheckoutPage = () => {
  const { items, totalPrice, clearCart } = useCart();
  const { formatPrice } = useCurrency();
  const { user } = useAuth();
  const { toast } = useToast();
  const [flowState, setFlowState] = useState<FlowState>("form");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [failureError, setFailureError] = useState<string | null>(null);

  // UPI state
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [upiPaymentId, setUpiPaymentId] = useState<string | null>(null);
  const [upiConfirming, setUpiConfirming] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Razorpay state
  const [razorpayPaymentRecord, setRazorpayPaymentRecord] = useState<any>(null);

  // Track reserved items for cleanup on failure
  const [reservedItems, setReservedItems] = useState<{ productId: string; quantity: number }[]>([]);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

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
    setFailureError(null);
    const reserved: { productId: string; quantity: number }[] = [];

    try {
      // Step 1: Reserve inventory
      for (const { product, quantity } of items) {
        await inventoryService.reserveStock(product.id, quantity);
        reserved.push({ productId: product.id, quantity });
      }
      setReservedItems(reserved);

      // Step 2: Create order with pending payment status
      const order = await orderService.create(user.id, totalPrice);
      setOrderId(order.id);
      setPendingOrderId(order.id);

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

      // Step 3: Process payment
      setFlowState("processing");

      const result = await paymentService.processPayment(user.id, order.id, totalPrice, paymentMethod);

      if (result.awaitingUpi) {
        // UPI flow — show QR code
        setQrCodeUrl(result.qrCodeUrl ?? null);
        setUpiPaymentId(result.payment?.id ?? null);
        setFlowState("upi_pending");
        setSubmitting(false);
        return;
      }

      if (result.awaitingRazorpay) {
        // Razorpay flow — open checkout modal
        setRazorpayPaymentRecord(result.payment);
        await openRazorpayCheckout(result.razorpayOrderId!, result.razorpayKeyId!, result.payment, order.id, reserved);
        setSubmitting(false);
        return;
      }

      if (result.success) {
        // Payment success — confirm stock + track analytics
        for (const { productId, quantity } of reserved) {
          await inventoryService.confirmStock(productId, quantity);
        }
        for (const { product, quantity } of items) {
          analyticsService.trackEvent('purchase', product.id, undefined, {
            quantity,
            price: product.discountPrice ?? product.price,
          });
        }

        setTransactionId(result.transactionId);
        clearCart();
        setFlowState("success");
      } else {
        // Payment failed — release inventory
        for (const { productId, quantity } of reserved) {
          try { await inventoryService.releaseStock(productId, quantity); } catch (_) {}
        }
        setFailureError(result.error ?? "Payment failed. Please try again.");
        setFlowState("failed");
      }
    } catch (err: any) {
      for (const { productId, quantity } of reserved) {
        try { await inventoryService.releaseStock(productId, quantity); } catch (_) {}
      }
      const msg = err.message?.includes('Insufficient stock') ? err.message : err.message ?? "Something went wrong.";
      toast({ title: "Order failed", description: msg, variant: "destructive" });
      setFlowState("form");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpiConfirm = async () => {
    if (!upiPaymentId || !orderId) return;
    setUpiConfirming(true);

    try {
      let proofUrl: string | undefined;
      if (proofFile) {
        proofUrl = await paymentService.uploadPaymentProof(proofFile);
      }

      await paymentService.confirmUpiPayment(upiPaymentId, orderId, proofUrl);

      // Confirm stock + track analytics
      for (const { productId, quantity } of reservedItems) {
        await inventoryService.confirmStock(productId, quantity);
      }
      for (const { product, quantity } of items) {
        analyticsService.trackEvent('purchase', product.id, undefined, {
          quantity,
          price: product.discountPrice ?? product.price,
        });
      }

      clearCart();
      setFlowState("success");
      toast({ title: "Payment submitted", description: "Your payment is being verified." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "Could not confirm payment.", variant: "destructive" });
    } finally {
      setUpiConfirming(false);
    }
  };

  const handleRetryPayment = async () => {
    if (!user || !pendingOrderId) return;
    setSubmitting(true);
    setFailureError(null);

    try {
      const reserved: { productId: string; quantity: number }[] = [];
      for (const { product, quantity } of items) {
        await inventoryService.reserveStock(product.id, quantity);
        reserved.push({ productId: product.id, quantity });
      }
      setReservedItems(reserved);

      setFlowState("processing");

      const result = await paymentService.processPayment(user.id, pendingOrderId, totalPrice, paymentMethod);

      if (result.awaitingUpi) {
        setQrCodeUrl(result.qrCodeUrl ?? null);
        setUpiPaymentId(result.payment?.id ?? null);
        setFlowState("upi_pending");
        setSubmitting(false);
        return;
      }

      if (result.success) {
        for (const { productId, quantity } of reserved) {
          await inventoryService.confirmStock(productId, quantity);
        }
        for (const { product, quantity } of items) {
          analyticsService.trackEvent('purchase', product.id, undefined, {
            quantity,
            price: product.discountPrice ?? product.price,
          });
        }
        setTransactionId(result.transactionId);
        clearCart();
        setFlowState("success");
      } else {
        for (const { productId, quantity } of reserved) {
          try { await inventoryService.releaseStock(productId, quantity); } catch (_) {}
        }
        setFailureError(result.error ?? "Payment failed. Please try again.");
        setFlowState("failed");
      }
    } catch (err: any) {
      toast({ title: "Retry failed", description: err.message ?? "Something went wrong.", variant: "destructive" });
      setFlowState("failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Processing state
  if (flowState === "processing") {
    return (
      <div className="container mx-auto px-4 py-20 text-center max-w-md">
        <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto mb-6" />
        <h1 className="text-2xl font-semibold">Processing Payment...</h1>
        <p className="text-muted-foreground mt-2">Please don't close this page. We're verifying your payment.</p>
      </div>
    );
  }

  // UPI Pending state — QR Code screen
  if (flowState === "upi_pending") {
    return (
      <div className="container mx-auto px-4 py-12 max-w-md">
        <div className="bg-card rounded-xl marketplace-shadow p-8 text-center">
          <div className="bg-primary/10 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <QrCode className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">Pay via UPI</h1>
          <p className="text-3xl font-bold text-primary mb-6">{formatPrice(totalPrice)}</p>

          {/* QR Code */}
          {qrCodeUrl && (
            <div className="bg-white rounded-xl p-4 inline-block mb-4">
              <img src={qrCodeUrl} alt="UPI QR Code" className="w-[200px] h-[200px]" />
            </div>
          )}

          {/* Merchant UPI ID */}
          <div className="bg-muted rounded-lg px-4 py-3 mb-6">
            <p className="text-xs text-muted-foreground mb-1">Or pay manually to UPI ID</p>
            <p className="font-mono font-semibold text-sm select-all">{platformSettings.merchantUpiId}</p>
          </div>

          {/* Instructions */}
          <div className="text-left space-y-2 mb-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">How to pay:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open any UPI app (Google Pay, PhonePe, Paytm, etc.)</li>
              <li>Scan the QR code above or enter the UPI ID</li>
              <li>Enter the exact amount: <span className="font-semibold text-foreground">{formatPrice(totalPrice)}</span></li>
              <li>Complete the payment and click "I Have Paid" below</li>
            </ol>
          </div>

          {/* Optional proof upload */}
          <div className="mb-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {proofFile ? proofFile.name : 'Upload Payment Screenshot (optional)'}
            </Button>
          </div>

          {/* Confirm button */}
          <Button
            size="lg"
            className="w-full h-12 mb-3"
            onClick={handleUpiConfirm}
            disabled={upiConfirming}
          >
            {upiConfirming ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirming...</>
            ) : (
              <><CheckCircle className="h-4 w-4 mr-2" /> I Have Paid</>
            )}
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/cart">Cancel & Return to Cart</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Success state
  if (flowState === "success") {
    return (
      <div className="container mx-auto px-4 py-20 text-center max-w-md">
        <div className="bg-success/10 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="h-10 w-10 text-success" />
        </div>
        <h1 className="text-2xl font-semibold">
          {paymentMethod === 'upi' ? 'Payment Submitted for Verification!' : 'Order Confirmed!'}
        </h1>
        <p className="text-muted-foreground mt-2">
          {paymentMethod === 'upi'
            ? 'Your UPI payment is being verified. We\'ll update your order once confirmed.'
            : 'Your payment was successful.'}
          {' '}Order ID:
        </p>
        {orderId && <p className="font-mono text-sm bg-muted px-3 py-1.5 rounded mt-2 inline-block">{orderId.slice(0, 8)}</p>}
        {transactionId && (
          <p className="text-xs text-muted-foreground mt-1">
            Transaction: <span className="font-mono">{transactionId}</span>
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-2">
          Payment: <span className="font-medium capitalize">{paymentMethod}</span>
          {paymentMethod === 'cod' ? ' — Pay on delivery' : paymentMethod === 'upi' ? ' — Pending verification' : ' — Paid'}
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <Button asChild><Link to="/profile">View Orders</Link></Button>
          <Button variant="outline" asChild><Link to="/">Continue Shopping</Link></Button>
        </div>
      </div>
    );
  }

  // Failed state
  if (flowState === "failed") {
    return (
      <div className="container mx-auto px-4 py-20 text-center max-w-md">
        <div className="bg-destructive/10 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-semibold">Payment Failed</h1>
        <p className="text-muted-foreground mt-2">{failureError ?? "Your payment could not be processed."}</p>
        <div className="mt-6 flex gap-3 justify-center">
          <Button onClick={handleRetryPayment} disabled={submitting}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Retrying...</> : 'Retry Payment'}
          </Button>
          <Button variant="outline" asChild><Link to="/cart">Back to Cart</Link></Button>
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
              <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  After placing your order, you'll see a QR code to scan with any UPI app.
                </p>
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