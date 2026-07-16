import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { paymentService } from "@/services/paymentService";
import { fetchPaymentMethodSettings } from "@/config/platformSettings";
import { Loader2, QrCode, RefreshCw, Upload } from "lucide-react";
import QRCode from "react-qr-code";

interface RetryPaymentPanelProps {
  payment: {
    id: string;
    order_id: string;
    amount: number;
    payment_method: string;
    payment_status: string;
    qr_code_url?: string | null;
  };
  onUpdated: () => void;
}

export default function RetryPaymentPanel({ payment, onUpdated }: RetryPaymentPanelProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [showUpi, setShowUpi] = useState(payment.payment_method === "upi" && payment.payment_status === "pending");
  const [qrUrl, setQrUrl] = useState<string | null>(payment.qr_code_url ?? null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const isUpi = payment.payment_method === "upi";
  const isRazorpay = payment.payment_method === "razorpay";

  const retryUpi = async () => {
    setBusy(true);
    try {
      const pm = await fetchPaymentMethodSettings();
      const upiLink = `upi://pay?pa=${encodeURIComponent(pm.merchantUpiId)}&pn=${encodeURIComponent(pm.merchantName ?? 'Marketplace')}&am=${payment.amount}&tn=Order-${payment.order_id.slice(0, 8)}&cu=INR`;
      
      setQrUrl(upiLink);
      setShowUpi(true);
      toast({ title: "Scan the QR code", description: "Pay using any UPI app, then confirm below." });
      onUpdated();
    } catch (e: any) {
      toast({ title: "Retry failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const confirmUpi = async () => {
    setBusy(true);
    try {
      let proofUrl: string | undefined;
      if (proofFile) {
        proofUrl = await paymentService.uploadPaymentProof(proofFile);
      }
      await paymentService.confirmUpiPayment(payment.id, payment.order_id, proofUrl);
      toast({ title: "Submitted for verification", description: "We'll notify you once our team verifies your payment." });
      onUpdated();
    } catch (e: any) {
      toast({ title: "Submission failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const retryRazorpay = async () => {
    setBusy(true);
    try {
      const pm = await fetchPaymentMethodSettings();
      const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
        body: { amount: Number(payment.amount), currency: 'INR', orderId: payment.order_id },
      });

      if (error || !data?.razorpayOrderId || !data?.keyId) {
        toast({ title: "Retry failed", description: "Could not initialize Razorpay", variant: "destructive" });
        return;
      }

      const loaded = await paymentService.loadRazorpayScript();
      if (!loaded) {
        toast({ title: "Razorpay unavailable", description: "Failed to load checkout script.", variant: "destructive" });
        return;
      }

      const rzp = new window.Razorpay({
        key: data.keyId,
        amount: Math.round(Number(payment.amount) * 100),
        currency: "INR",
        name: pm.merchantName ?? "Marketplace",
        description: `Order #${payment.order_id.slice(0, 8)}`,
        order_id: data.razorpayOrderId,
        handler: async (resp: any) => {
          try {
            await paymentService.confirmRazorpayPayment(
              payment.id,
              payment.order_id,
              resp.razorpay_payment_id,
              resp.razorpay_order_id,
              resp.razorpay_signature,
            );
            toast({ title: "Payment successful", description: "Thanks — your order is confirmed." });
            onUpdated();
          } catch (e: any) {
            toast({ title: "Verification failed", description: e?.message ?? "Unknown error", variant: "destructive" });
          }
        },
        modal: {
          ondismiss: () => {
            // Payment status on dismissal is handled server-side via webhook / timeout.
            onUpdated();
          },
        },
        theme: { color: "#6366f1" },
      });
      rzp.open();
    } catch (e: any) {
      toast({ title: "Retry failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (payment.payment_method === "cod") {
    return (
      <p className="text-sm text-muted-foreground">
        Cash on Delivery — pay when your order arrives. No retry needed.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {showUpi && qrUrl && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <QrCode className="w-4 h-4" /> Scan to pay
          </div>
          <div className="mx-auto w-48 h-48 bg-white p-2 rounded-md border border-border">
            <QRCode
              value={(() => {
                if (!qrUrl) return "";
                if (qrUrl.toLowerCase().startsWith("http")) {
                  try {
                    const url = new URL(qrUrl);
                    return url.searchParams.get("data") || url.searchParams.get("chl") || qrUrl;
                  } catch {
                    return qrUrl;
                  }
                }
                return qrUrl;
              })()}
              size={256}
              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
              viewBox={`0 0 256 256`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proof" className="text-xs">Upload payment screenshot (optional)</Label>
            <Input
              id="proof"
              type="file"
              accept="image/*"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button onClick={confirmUpi} disabled={busy} className="w-full">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
            I've paid — submit for verification
          </Button>
        </div>
      )}

      {!showUpi && isUpi && (
        <Button onClick={retryUpi} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Retry UPI payment
        </Button>
      )}

      {isRazorpay && (
        <Button onClick={retryRazorpay} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Retry with Razorpay
        </Button>
      )}
    </div>
  );
}
