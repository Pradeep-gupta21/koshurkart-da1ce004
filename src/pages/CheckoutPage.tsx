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
import { supabase } from "@/integrations/supabase/client";
import { analyticsService } from "@/services/analyticsService";
import { PricingDebugBox } from "@/components/checkout/PricingDebugBox";

import { fetchPaymentMethodSettings, type PaymentMethodSettings } from "@/config/platformSettings";
import { useToast } from "@/hooks/use-toast";
import { useCheckoutQuote } from "@/hooks/useCheckoutQuote";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, Loader2, CreditCard, Banknote, XCircle, Upload, QrCode, Check, AlertCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import koshurkartLogoAsset from "@/assets/koshurkart-logo-256.png.asset.json";

const ALL_PAYMENT_METHODS = [
  { value: "razorpay", label: "Pay via Razorpay", description: "UPI, Cards, Netbanking & Wallets", icon: CreditCard, iconBg: "bg-primary/10 text-primary", recommended: true },
  { value: "cod", label: "Cash on Delivery", description: "Pay when you receive your order", icon: Banknote, iconBg: "bg-secondary/10 text-secondary", recommended: false },
] as const;

type FlowState = "form" | "processing" | "success" | "failed" | "upi_pending" | "razorpay_pending";

const CheckoutPage = () => {
  const { items, totalPrice, shippingTotal, hasUnserviceableItem, codAvailable, clearCart, isBuyNow, exitBuyNow } = useCart();
  const codBlockedByItem = items.some((i) => i.product.allowCod === false);
  const { formatPrice } = useCurrency();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
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

  // Direct Influencer UPI checkout: populated only when the entire cart belongs
  // to a single commission-exempt vendor that has configured their personal
  // UPI/QR. When set, the standard Razorpay/COD selector is hidden and the
  // buyer pays the vendor directly.
  const [directUpi, setDirectUpi] = useState<{
    vendorId: string;
    storeName: string;
    upiId: string;
    qrUrl: string;
  } | null>(null);

  useEffect(() => {
    fetchPaymentMethodSettings().then((s) => {
      setPmSettings(s);
      // Razorpay is the recommended default.
      if (s.razorpayEnabled) setPaymentMethod("razorpay");
      else setPaymentMethod("cod");
    });
  }, []);

  // If the user navigates away from checkout mid-buy-now (e.g. back button),
  // discard the buy-now snapshot and restore their persistent cart.
  useEffect(() => {
    return () => {
      if (isBuyNow) exitBuyNow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect Direct Influencer UPI: only valid when the cart is from a single
  // vendor that is commission-exempt AND has configured their personal UPI.
  useEffect(() => {
    if (items.length === 0) { setDirectUpi(null); return; }
    const vendorIds = Array.from(new Set(items.map((i) => i.product.vendorId).filter(Boolean)));
    if (vendorIds.length !== 1) { setDirectUpi(null); return; }
    const vId = vendorIds[0]!;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_vendor_direct_checkout", { _vendor_id: vId });
      if (cancelled || error) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.is_commission_exempt && row?.direct_upi_id && row?.direct_upi_qr_url) {
        setDirectUpi({
          vendorId: vId,
          storeName: row.store_name ?? "Vendor",
          upiId: row.direct_upi_id,
          qrUrl: row.direct_upi_qr_url,
        });
      } else {
        setDirectUpi(null);
      }
    })();
    return () => { cancelled = true; };
  }, [items]);



  // If COD is unavailable for this destination but it was selected, switch away
  useEffect(() => {
    if (paymentMethod === "cod" && !codAvailable && pmSettings) {
      if (pmSettings.razorpayEnabled) setPaymentMethod("razorpay");
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
    firstName: "", lastName: "", phone: "", email: user?.email ?? "",
    address: "", city: "", state: "", zip: "", notes: "",
  });

  useEffect(() => {
    if (user?.email && !shipping.email) {
      setShipping((s) => ({ ...s, email: user.email ?? "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

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

    // 256×256 PNG served from the Lovable CDN — Razorpay requires an absolute URL.
    const logoUrl = `${window.location.origin}${koshurkartLogoAsset.url}`;

    // Resolve a vendor-preferred display name for the Razorpay modal title.
    // When the cart contains a single vendor we honour their `checkout_display_name`
    // choice (store name vs. bank account holder name). Multi-vendor carts fall
    // back to the platform name.
    let modalName = "Koshur Kart";
    let preferredVendorName = "";
    try {
      const vendorIds = Array.from(
        new Set(items.map((i) => (i.product as any).vendorId).filter(Boolean) as string[]),
      );
      if (vendorIds.length === 1) {
        const vendorId = vendorIds[0];
        const { data: preferred } = await supabase.rpc("get_vendor_checkout_name", { _vendor_id: vendorId });
        let resolved = typeof preferred === "string" ? preferred.trim() : "";
        // Fallback for legacy vendors with null/empty checkout_display_name:
        // pull the registered store name directly so the modal never shows the bare platform name.
        if (!resolved) {
          const { data: v } = await supabase
            .from("vendors")
            .select("store_name")
            .eq("id", vendorId)
            .maybeSingle();
          resolved = (v?.store_name ?? "").trim();
        }
        if (resolved) {
          modalName = `Koshur Kart - ${resolved}`;
          preferredVendorName = resolved;
        }
      } else if (vendorIds.length > 1) {
        preferredVendorName = `${vendorIds.length} vendors`;
      }
    } catch (e) {
      console.warn("Failed to resolve vendor display name", e);
    }

    const vendorDescription = preferredVendorName
      ? `Order #${currentOrderId.slice(0, 8)} · Fulfillment via ${preferredVendorName}`
      : `Order #${currentOrderId.slice(0, 8)}`;

    const options = {
      key: razorpayKeyId,
      amount: Math.round(serverTotal * 100),
      currency: "INR",
      name: modalName,
      description: vendorDescription,
      image: logoUrl,
      order_id: razorpayOrderId,
      prefill: {
        name: `${shipping.firstName} ${shipping.lastName}`.trim() || user?.user_metadata?.name || "",
        email: shipping.email || user?.email || "",
        contact: shipping.phone || "",
      },
      notes: {
        order_id: currentOrderId,
        recipient: `${shipping.firstName} ${shipping.lastName}`.trim(),
      },
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

          clearCart();
          supabase.functions
            .invoke("send-transactional-email", { body: { type: "order_confirmation", orderId: currentOrderId } })
            .catch((e) => console.warn("order email failed", e));
          navigate(`/payment/success?orderId=${currentOrderId}&paymentId=${payment.id}&txn=${response.razorpay_payment_id}`, { replace: true });
        } catch (err: any) {
          const reason = encodeURIComponent(err?.message ?? "Payment confirmation failed.");
          navigate(`/payment/failed?orderId=${currentOrderId}&paymentId=${payment.id}&reason=${reason}`, { replace: true });
        }
      },
      modal: {
        ondismiss: async () => {
          await paymentService.updatePaymentStatus(payment.id, 'failed');
          const reason = encodeURIComponent("Payment was cancelled.");
          navigate(`/payment/failed?orderId=${currentOrderId}&paymentId=${payment.id}&reason=${reason}`, { replace: true });
        },
      },
      theme: { color: "#0F172A" },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  const buildShippingPayload = () => ({
    recipient_name: `${shipping.firstName} ${shipping.lastName}`.trim(),
    recipient_phone: shipping.phone.trim(),
    recipient_email: shipping.email.trim() || undefined,
    address: shipping.address.trim(),
    city: shipping.city.trim(),
    state: shipping.state.trim() || undefined,
    pincode: shipping.zip.trim(),
    notes: shipping.notes.trim() || undefined,
  });

  const handlePlaceOrder = async () => {
    if (!user) return;
    if (!shipping.firstName || !shipping.lastName || !shipping.phone || !shipping.address || !shipping.city || !shipping.zip) {
      toast({ title: "Missing shipping info", description: "Please fill in name, phone, address, city, and pincode.", variant: "destructive" });
      return;
    }
    if (!/^\d{6}$/.test(shipping.zip.trim())) {
      toast({ title: "Invalid pincode", description: "Pincode must be 6 digits.", variant: "destructive" });
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
      const itemsPayload = items.map(({ product, quantity }) => ({
        product_id: product.id,
        quantity,
      }));

      // Direct Influencer UPI override: settle off-gateway, vendor-to-buyer.
      const effectiveMethod: 'cod' | 'upi' | 'razorpay' = directUpi
        ? 'upi'
        : (paymentMethod as 'cod' | 'upi' | 'razorpay');

      setFlowState("processing");
      const result = await paymentService.startCheckout(
        itemsPayload,
        effectiveMethod,
        shipping.zip,
        quote?.subtotal,
        buildShippingPayload(),
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
      supabase.functions
        .invoke("send-transactional-email", { body: { type: "order_confirmation", orderId: result.orderId } })
        .catch((e) => console.warn("order email failed", e));
      navigate(`/payment/success?orderId=${result.orderId}&paymentId=${result.paymentId}&method=cod`, { replace: true });
      return;
    } catch (err: any) {
      const isMismatch = err?.message?.includes('Amount mismatch') || err?.code === 'AMOUNT_MISMATCH';
      const msg = isMismatch
        ? 'Pricing mismatch detected. Please refresh the page and try again.'
        : (err?.message ?? "Something went wrong.");
      logger.error('checkout.place_order', msg, {
        status: err?.status,
        code: err?.code,
        payment_method: paymentMethod,
        item_count: items.length,
      });
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
        buildShippingPayload(),
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
            <div className="bg-card border border-border rounded-xl p-4 inline-block mb-4 shadow-sm">
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
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input type="tel" placeholder="+91 98765 43210" value={shipping.phone} onChange={e => setShipping(s => ({ ...s, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Email (optional)</Label>
                <Input type="email" placeholder="you@example.com" value={shipping.email} onChange={e => setShipping(s => ({ ...s, email: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Address</Label>
                <Input placeholder="House / Street / Landmark" value={shipping.address} onChange={e => setShipping(s => ({ ...s, address: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input placeholder="Srinagar" value={shipping.city} onChange={e => setShipping(s => ({ ...s, city: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input placeholder="Jammu & Kashmir" value={shipping.state} onChange={e => setShipping(s => ({ ...s, state: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Pincode</Label>
                <Input placeholder="190001" inputMode="numeric" maxLength={6} value={shipping.zip} onChange={e => setShipping(s => ({ ...s, zip: e.target.value.replace(/\D/g, '') }))} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Order Notes (optional)</Label>
                <Input placeholder="Delivery instructions for the vendor" value={shipping.notes} onChange={e => setShipping(s => ({ ...s, notes: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl marketplace-shadow p-6">
            <h2 className="font-semibold mb-4">Payment Method</h2>
            {codBlockedByItem && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                COD is not available for some items in your cart.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {availableMethods.map(({ value, label, description, icon: Icon, iconBg }) => {
                const isSelected = paymentMethod === value;
                const isDisabled = value === "cod" && !codAvailable;
                const disabledReason = value === "cod" && codBlockedByItem
                  ? "Not available for some items in cart"
                  : "Not available for this PIN";
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
                        {isDisabled ? disabledReason : description}
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