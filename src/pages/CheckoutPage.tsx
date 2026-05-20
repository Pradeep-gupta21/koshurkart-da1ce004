import { useState, useRef, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useAuth } from "@/hooks/useAuth";
import { paymentService, type CheckoutResult } from "@/services/paymentService";
import { analyticsService } from "@/services/analyticsService";
import { PricingDebugBox } from "@/components/checkout/PricingDebugBox";

import { fetchPaymentMethodSettings, type PaymentMethodSettings } from "@/config/platformSettings";
import { useToast } from "@/hooks/use-toast";
import { useCheckoutQuote } from "@/hooks/useCheckoutQuote";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, Loader2, CreditCard, Banknote, XCircle, Upload, QrCode, Check, AlertCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const ALL_PAYMENT_METHODS = [
  { value: "razorpay", label: "Pay via Razorpay", description: "UPI, Cards, Netbanking & Wallets", icon: CreditCard, iconBg: "bg-primary/10 text-primary", recommended: true },
  { value: "cod", label: "Cash on Delivery", description: "Pay when you receive your order", icon: Banknote, iconBg: "bg-secondary/10 text-secondary", recommended: false },
] as const;

type FlowState = "form" | "processing" | "success" | "failed" | "upi_pending" | "razorpay_pending";

const CheckoutPage = () => {
  const { items, totalPrice, shippingTotal, hasUnserviceableItem, codAvailable, clearCart } = useCart();
  const { formatPrice } = useCurrency();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: quote, isLoading: quoteLoading, error: quoteError, refetch: refetchQuote, isFetching: quoteFetching } = useCheckoutQuote();
  const [flowState, setFlowState] = useState<FlowState>("form");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [failureError, setFailureError] = useState<string | null>(null);
  const [pmSettings, setPmSettings] = useState<PaymentMethodSettings | null>(null);
  const [paymentMode, setPaymentMode] = useState<'test' | 'live' | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);

  useEffect(() => {
    fetchPaymentMethodSettings().then((s) => {
      setPmSettings(s);
      // Set default to first available method
      if (s.upiEnabled) setPaymentMethod("upi");
      else if (s.razorpayEnabled) setPaymentMethod("razorpay");
      else setPaymentMethod("cod");
    });
  }, []);

  // If COD is unavailable for this destination but it was selected, switch away
  useEffect(() => {
    if (paymentMethod === "cod" && !codAvailable && pmSettings) {
      if (pmSettings.upiEnabled) setPaymentMethod("upi");
      else if (pmSettings.razorpayEnabled) setPaymentMethod("razorpay");
    }
  }, [codAvailable, paymentMethod, pmSettings]);

  const availableMethods = useMemo(() => {
    if (!pmSettings) return ALL_PAYMENT_METHODS.filter((m) => m.value === "cod");
    return ALL_PAYMENT_METHODS.filter((m) => {
      if (m.value === "razorpay") return pmSettings.razorpayEnabled;
      return true; // cod always listed; disabled below if not available
    });
  }, [pmSettings]);

  // UPI state
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [upiPaymentId, setUpiPaymentId] = useState<string | null>(null);
  const [upiConfirming, setUpiConfirming] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tracked only to keep Razorpay handler closure stable; not read directly in render.
  const [, setRazorpayPaymentRecord] = useState<{ id: string } | null>(null);
  const [, setPendingOrderId] = useState<string | null>(null);

  const [shipping, setShipping] = useState({
    firstName: "", lastName: "", address: "", city: "", zip: "",
  });

  const openRazorpayCheckout = async (
    razorpayOrderId: string,
    razorpayKeyId: string,
    payment: { id: string },
    currentOrderId: string,
    serverTotal: number
  ) => {
    const scriptLoaded = await paymentService.loadRazorpayScript();
    if (!scriptLoaded) {
      toast({ title: "Error", description: "Failed to load Razorpay. Please try again.", variant: "destructive" });
      setFlowState("failed");
      setFailureError("Could not load payment gateway.");
      return;
    }

    const options = {
      key: razorpayKeyId,
      // Display amount only — actual charge is determined by razorpay order_id on Razorpay's side.
      amount: Math.round(serverTotal * 100),
      currency: "INR",
      name: pmSettings?.merchantName ?? "Marketplace",
      description: `Order #${currentOrderId.slice(0, 8)}`,
      order_id: razorpayOrderId,
      handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        try {
          setFlowState("processing");
          await paymentService.confirmRazorpayPayment(
            payment.id,
            currentOrderId,
            response.razorpay_payment_id,
            response.razorpay_order_id,
            response.razorpay_signature
          );

          for (const { product, quantity } of items) {
            analyticsService.trackEvent('purchase', product.id, undefined, {
              quantity,
              price: product.discountPrice ?? product.price,
            });
          }

          setTransactionId(response.razorpay_payment_id);
          clearCart();
          setFlowState("success");
        } catch (err: any) {
          setFailureError(err.message ?? "Payment confirmation failed.");
          setFlowState("failed");
        }
      },
      modal: {
        ondismiss: async () => {
          // Server-side stale-order sweep will release the reservation if not paid.
          await paymentService.updatePaymentStatus(payment.id, 'failed');
          setFailureError("Payment was cancelled.");
          setFlowState("failed");
        },
      },
      theme: { color: "#6366f1" },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  const handlePlaceOrder = async () => {
    if (!user) return;
    if (!shipping.firstName || !shipping.lastName || !shipping.address || !shipping.city || !shipping.zip) {
      toast({ title: "Missing shipping info", description: "Please fill in all shipping fields.", variant: "destructive" });
      return;
    }
    if (hasUnserviceableItem) {
      toast({ title: "Delivery unavailable", description: "Some items can't ship to your delivery location. Please update it.", variant: "destructive" });
      return;
    }
    if (paymentMethod === "cod" && !codAvailable) {
      toast({ title: "COD not available", description: "Cash on Delivery isn't supported for this destination.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    setFailureError(null);

    try {
      // Single backend call — server re-prices, reserves stock, creates order + payment.
      const itemsPayload = items.map(({ product, quantity }) => ({
        product_id: product.id,
        quantity,
      }));

      setFlowState("processing");
      const result = await paymentService.startCheckout(
        itemsPayload,
        paymentMethod as 'cod' | 'upi' | 'razorpay',
        shipping.zip,
        quote?.subtotal,
      );

      setOrderId(result.orderId);
      setCheckoutResult(result);
      setPendingOrderId(result.orderId);
      if (result.mode) setPaymentMode(result.mode);
      if (result.method === 'upi') {
        setQrCodeUrl(result.qrCodeUrl ?? null);
        setUpiPaymentId(result.paymentId);
        setFlowState("upi_pending");
        return;
      }

      if (result.method === 'razorpay') {
        setRazorpayPaymentRecord({ id: result.paymentId });
        await openRazorpayCheckout(
          result.razorpayOrderId!,
          result.keyId!,
          { id: result.paymentId },
          result.orderId,
          result.total
        );
        return;
      }

      // COD success
      for (const { product, quantity } of items) {
        analyticsService.trackEvent('purchase', product.id, undefined, {
          quantity,
          price: product.discountPrice ?? product.price,
        });
      }
      clearCart();
      setFlowState("success");
    } catch (err: any) {
      const isMismatch = err?.message?.includes('Amount mismatch') || err?.code === 'AMOUNT_MISMATCH';
      const msg = isMismatch
        ? 'Pricing mismatch detected. Please refresh the page and try again.'
        : (err?.message ?? "Something went wrong.");
      toast({ title: "Order failed", description: msg, variant: "destructive" });
      setFailureError(msg);
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
    if (!user) return;
    setSubmitting(true);
    setFailureError(null);

    try {
      // Retry = brand-new server checkout. The previous order's stale reservation
      // is released by sweep_stale_orders cron.
      const itemsPayload = items.map(({ product, quantity }) => ({
        product_id: product.id,
        quantity,
      }));

      setFlowState("processing");
      const result = await paymentService.startCheckout(
        itemsPayload,
        paymentMethod as 'cod' | 'upi' | 'razorpay',
        shipping.zip,
        quote?.subtotal,
      );

      setOrderId(result.orderId);
      setCheckoutResult(result);
      setPendingOrderId(result.orderId);
      if (result.mode) setPaymentMode(result.mode);

      if (result.method === 'upi') {
        setQrCodeUrl(result.qrCodeUrl ?? null);
        setUpiPaymentId(result.paymentId);
        setFlowState("upi_pending");
        return;
      }
      if (result.method === 'razorpay') {
        setRazorpayPaymentRecord({ id: result.paymentId });
        await openRazorpayCheckout(
          result.razorpayOrderId!,
          result.keyId!,
          { id: result.paymentId },
          result.orderId,
          result.total
        );
        return;
      }
      clearCart();
      setFlowState("success");
    } catch (err: any) {
      toast({ title: "Retry failed", description: err.message ?? "Something went wrong.", variant: "destructive" });
      setFlowState("failed");
    } finally {
      setSubmitting(false);
    }
  };

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
            <p className="font-mono font-semibold text-sm select-all">{pmSettings?.merchantUpiId ?? "merchant@upi"}</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {availableMethods.map(({ value, label, description, icon: Icon, iconBg }) => {
                const isSelected = paymentMethod === value;
                const isDisabled = value === "cod" && !codAvailable;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => !isDisabled && setPaymentMethod(value)}
                    className={cn(
                      "relative flex flex-col items-center text-center gap-3 p-5 rounded-xl border-2 transition-all",
                      isDisabled && "opacity-50 cursor-not-allowed",
                      !isDisabled && "cursor-pointer",
                      isSelected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                        : "border-border hover:border-primary/30 hover:bg-muted/30"
                    )}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                    <div className={cn("h-12 w-12 rounded-full flex items-center justify-center", iconBg)}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isDisabled ? "Not available for this PIN" : description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {paymentMethod === 'upi' && (
              <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  After placing your order, you'll see a QR code to scan with any UPI app.
                </p>
              </div>
            )}
            {paymentMethod === 'razorpay' && (
              <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  You'll be redirected to Razorpay's secure checkout to complete payment via UPI, card, net banking, or wallet.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="bg-card rounded-xl marketplace-shadow p-6 sticky top-24">
            <h2 className="font-semibold mb-4">Order Summary</h2>

            <PricingDebugBox debug={checkoutResult?.debug ?? quote?.debug ?? null} />

            {/* Line items: prefer server-priced lines for accuracy */}
            <div className="space-y-3 text-sm">
              {quote
                ? quote.lines.map((l) => (
                    <div key={l.product_id} className="flex justify-between">
                      <span className="text-muted-foreground truncate mr-2">{l.title} ×{l.quantity}</span>
                      <span className="tabular-nums shrink-0">{formatPrice(l.line_total)}</span>
                    </div>
                  ))
                : items.map(({ product, quantity }) => (
                    <div key={product.id} className="flex justify-between">
                      <span className="text-muted-foreground truncate mr-2">{product.title} ×{quantity}</span>
                      <span className="tabular-nums shrink-0">{formatPrice((product.discountPrice ?? product.price) * quantity)}</span>
                    </div>
                  ))}
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                {shippingTotal > 0 ? (
                  <span className="tabular-nums">{formatPrice(shippingTotal)}</span>
                ) : (
                  <span className="text-success font-medium">Free</span>
                )}
              </div>
            </div>

            {/* Final amount block — server-quoted, locked */}
            <div className="mt-5 rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>Verified by our server</span>
              </div>
              {quoteLoading ? (
                <Skeleton className="h-9 w-32" />
              ) : quoteError ? (
                <div className="space-y-2">
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" /> Could not load price
                  </p>
                  <Button size="sm" variant="outline" onClick={() => refetchQuote()} className="gap-2">
                    <RefreshCw className="h-3.5 w-3.5" /> Retry
                  </Button>
                </div>
              ) : quote ? (
                <>
                  <p className="text-2xl font-bold tabular-nums">
                    Final amount: {formatPrice(quote.subtotal + shippingTotal)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    This is the exact amount you will be charged in INR.
                  </p>
                  {Math.abs(quote.subtotal - totalPrice) > 0.01 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-start gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      Prices were updated since you added items to your cart.
                    </p>
                  )}
                </>
              ) : null}
            </div>

            {hasUnserviceableItem && (
              <p className="mt-4 text-xs text-destructive bg-destructive/10 rounded-md p-2.5">
                Some items can't be delivered. Update your delivery location or remove them.
              </p>
            )}
            <Button
              size="lg"
              className="w-full mt-6 h-12"
              disabled={submitting || hasUnserviceableItem || quoteLoading || !!quoteError || !quote || quoteFetching}
              onClick={handlePlaceOrder}
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
              ) : quoteLoading || quoteFetching ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading price...</>
              ) : quote ? (
                `Place Order — ${formatPrice(quote.subtotal + shippingTotal)}`
              ) : (
                'Place Order'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;