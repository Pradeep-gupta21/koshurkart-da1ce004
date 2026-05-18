import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { paymentService } from "@/services/paymentService";
import { fetchPaymentMethodSettings } from "@/config/platformSettings";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, QrCode, RefreshCw, Upload } from "lucide-react";

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
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [showUpi, setShowUpi] = useState(payment.payment_method === "upi" && payment.payment_status === "pending");
  const [qrUrl, setQrUrl] = useState<string | null>(payment.qr_code_url ?? null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const isUpi = payment.payment_method === "upi";
  const isRazorpay = payment.payment_method === "razorpay";

  const retryUpi = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const result = await paymentService.processPayment(
        user.id,
        payment.order_id,
        Number(payment.amount),
        "upi"
      );
      if (result.awaitingUpi && result.qrCodeUrl) {
        setQrUrl(result.qrCodeUrl);
        setShowUpi(true);
        toast({ title: "Scan the QR code", description: "Pay using any UPI app, then confirm below." });
        onUpdated();
      } else if (result.error) {
        toast({ title: "Could not start UPI", description: result.error, variant: "destructive" });
      }
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
    if (!user) return;
    setBusy(true);
    try {
      const pm = await fetchPaymentMethodSettings();
      const result = await paymentService.processPayment(
        user.id,
        payment.order_id,
        Number(payment.amount),
        "razorpay"
      );
      if (!result.razorpayOrderId || !result.razorpayKeyId) {
        toast({ title: "Retry failed", description: result.error ?? "Could not initialize Razorpay", variant: "destructive" });
        return;
      }
      const loaded = await paymentService.loadRazorpayScript();
      if (!loaded) {
        toast({ title: "Razorpay unavailable", description: "Failed to load checkout script.", variant: "destructive" });
        return;
      }
      const rzp = new window.Razorpay({
        key: result.razorpayKeyId,
        amount: Math.round(Number(payment.amount) * 100),
        currency: "INR",
        name: pm.merchantName ?? "Marketplace",
        description: `Order #${payment.order_id.slice(0, 8)}`,
        order_id: result.razorpayOrderId,
        handler: async (resp: any) => {
          try {
            await paymentService.confirmRazorpayPayment(
              result.payment.id,
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
          ondismiss: async () => {
            await paymentService.updatePaymentStatus(result.payment.id, "failed");
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
          <img src={qrUrl} alt="UPI QR code" className="w-48 h-48 mx-auto rounded-md border border-border" />
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
