import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, User, Phone, Mail, MapPin, StickyNote, Package, IndianRupee } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";

interface Props {
  orderId: string | null;
  vendorItems: { id: string; title: string; price: number; quantity: number; image: string | null }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OrderDetails {
  id: string;
  created_at: string;
  order_status: string;
  payment_status: string;
  shipping_status: string;
  total_amount: number;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_pincode: string | null;
  order_notes: string | null;
  shipping_provider: string | null;
  tracking_id: string | null;
  estimated_delivery: string | null;
}

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    delivered: "bg-success/15 text-success border-success/30",
    paid: "bg-success/15 text-success border-success/30",
    confirmed: "bg-primary/15 text-primary border-primary/30",
    success: "bg-success/15 text-success border-success/30",
    pending: "bg-warning/15 text-warning border-warning/30",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
    cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
};

export const VendorOrderDetailsDialog = ({ orderId, vendorItems, open, onOpenChange }: Props) => {
  const { formatPrice } = useCurrency();
  const [details, setDetails] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetails(null);
    (async () => {
      // SECURITY: server-side function enforces that vendor can only read orders
      // containing their own items (or admin).
      const { data, error } = await supabase.rpc("get_vendor_order_details", { _order_id: orderId });
      if (cancelled) return;
      if (error) setError(error.message);
      else if (data && data.length) setDetails(data[0] as OrderDetails);
      else setError("Order not found");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, orderId]);

  const vendorSubtotal = vendorItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Order Details</DialogTitle>
          <DialogDescription>
            {orderId && <>Order #<span className="font-mono">{orderId.slice(0, 8)}</span></>}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</div>
        )}

        {details && (
          <div className="space-y-5">
            {/* Status row */}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className={statusBadge(details.order_status)}>
                Order: {details.order_status}
              </Badge>
              <Badge variant="outline" className={statusBadge(details.payment_status)}>
                Payment: {details.payment_status}
              </Badge>
              <Badge variant="outline" className={statusBadge(details.shipping_status)}>
                Shipping: {details.shipping_status}
              </Badge>
              <Badge variant="outline">
                Placed: {new Date(details.created_at).toLocaleString()}
              </Badge>
            </div>

            <Separator />

            {/* Customer */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <User className="h-4 w-4" /> Customer
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Name</p>
                  <p className="font-medium">{details.recipient_name || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</p>
                  {details.recipient_phone ? (
                    <a className="font-medium text-primary hover:underline" href={`tel:${details.recipient_phone}`}>
                      {details.recipient_phone}
                    </a>
                  ) : <p>—</p>}
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> Email</p>
                  {details.recipient_email ? (
                    <a className="font-medium text-primary hover:underline break-all" href={`mailto:${details.recipient_email}`}>
                      {details.recipient_email}
                    </a>
                  ) : <p>—</p>}
                </div>
              </div>
            </div>

            <Separator />

            {/* Delivery address */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Delivery Address
              </h3>
              {details.shipping_address ? (
                <div className="text-sm bg-muted/40 rounded-md p-3 leading-relaxed">
                  <p>{details.shipping_address}</p>
                  <p>
                    {[details.shipping_city, details.shipping_state].filter(Boolean).join(", ")}
                    {details.shipping_pincode ? ` — ${details.shipping_pincode}` : ""}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No shipping address captured for this order.
                </p>
              )}
            </div>

            {details.order_notes && (
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <StickyNote className="h-4 w-4" /> Customer Notes
                </h3>
                <p className="text-sm bg-muted/40 rounded-md p-3 italic">{details.order_notes}</p>
              </div>
            )}

            <Separator />

            {/* Your items */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" /> Your Items in this Order
              </h3>
              <div className="space-y-2">
                {vendorItems.map((it) => (
                  <div key={it.id} className="flex items-center gap-3 border rounded-md p-2">
                    {it.image && <img src={it.image} alt={it.title} className="h-12 w-12 rounded object-cover" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{it.title}</p>
                      <p className="text-xs text-muted-foreground">Qty: {it.quantity} × {formatPrice(Number(it.price))}</p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{formatPrice(Number(it.price) * it.quantity)}</p>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-3 text-sm">
                <span className="text-muted-foreground">Your subtotal</span>
                <span className="font-semibold tabular-nums">{formatPrice(vendorSubtotal)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground flex items-center gap-1"><IndianRupee className="h-3 w-3" /> Order total</span>
                <span className="font-semibold tabular-nums">{formatPrice(Number(details.total_amount))}</span>
              </div>
            </div>

            {(details.shipping_provider || details.tracking_id) && (
              <>
                <Separator />
                <div className="text-sm">
                  <h3 className="font-semibold mb-2">Shipment</h3>
                  {details.shipping_provider && <p>Carrier: <span className="font-medium">{details.shipping_provider}</span></p>}
                  {details.tracking_id && <p>Tracking: <span className="font-mono">{details.tracking_id}</span></p>}
                  {details.estimated_delivery && <p>ETA: {new Date(details.estimated_delivery).toLocaleDateString()}</p>}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
