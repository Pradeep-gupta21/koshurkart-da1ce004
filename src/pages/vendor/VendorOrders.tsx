import { useEffect, useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { orderService } from "@/services/orderService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Package, Truck, CheckCircle2, Loader2, CalendarIcon, MapPin, Navigation, Eye } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { ShippingStatus } from "@/types/order";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useCurrency } from "@/contexts/CurrencyContext";
import { VendorOrderDetailsDialog } from "@/components/vendor/VendorOrderDetailsDialog";

interface VendorOrderItem {
  id: string;
  title: string;
  price: number;
  quantity: number;
  image: string | null;
  product_id: string | null;
  order_id: string;
  order?: {
    id: string;
    created_at: string;
    order_status: string;
    payment_status: string;
    total_amount: number;
    user_id: string;
    shipping_provider: string | null;
    tracking_id: string | null;
    shipping_status: string;
    estimated_delivery: string | null;
  };
}

const SHIPPING_STATUSES: ShippingStatus[] = ["pending", "shipped", "in_transit", "out_for_delivery", "delivered"];

const statusColor: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  processing: "bg-warning/15 text-warning border-warning/30",
  shipped: "bg-primary/15 text-primary border-primary/30",
  in_transit: "bg-accent/15 text-accent-foreground border-accent/30",
  out_for_delivery: "bg-warning/15 text-warning border-warning/30",
  delivered: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

const statusLabel: Record<string, string> = {
  pending: "Pending",
  shipped: "Shipped",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
};

const PROVIDERS = ["FedEx", "UPS", "DHL", "USPS", "Other"];

const nextShippingStatus: Record<string, ShippingStatus> = {
  pending: "shipped",
  shipped: "in_transit",
  in_transit: "out_for_delivery",
  out_for_delivery: "delivered",
};

const VendorOrders = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const [items, setItems] = useState<VendorOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingOrder, setUpdatingOrder] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState("");
  const [providerInput, setProviderInput] = useState("");
  const [estDelivery, setEstDelivery] = useState<Date | undefined>();

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("order_items")
      .select("*, order:orders(*)")
      .eq("vendor_id", vendorId)
      .order("id", { ascending: false });
    if (error) {
      toast({ title: "Error loading orders", description: error.message, variant: "destructive" });
    } else {
      setItems((data as any) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { if (vendorId) fetchOrders(); }, [vendorId]);

  // Live: new order items for this vendor
  const handleRealtimeOrder = useCallback(() => {
    fetchOrders();
    toast({ title: "📦 Orders updated", description: "New order activity detected." });
  }, []);

  useRealtimeSubscription({
    table: "order_items",
    event: "INSERT",
    filter: `vendor_id=eq.${vendorId}`,
    onPayload: handleRealtimeOrder,
    enabled: !!vendorId,
  });

  // Live: order status changes
  useRealtimeSubscription({
    table: "orders",
    event: "UPDATE",
    onPayload: handleRealtimeOrder,
    enabled: !!vendorId,
  });

  const advanceShipping = async (orderId: string, currentStatus: string) => {
    const next = nextShippingStatus[currentStatus];
    if (!next) return;
    setUpdatingOrder(orderId);
    try {
      await orderService.updateShipment(orderId, { shipping_status: next });
      toast({ title: "Shipment updated", description: `Status changed to ${statusLabel[next]}.` });
      fetchOrders();
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
    setUpdatingOrder(null);
  };

  const saveShipmentDetails = async (orderId: string) => {
    setUpdatingOrder(orderId);
    try {
      await orderService.updateShipment(orderId, {
        shipping_provider: providerInput || undefined,
        tracking_id: trackingInput || undefined,
        estimated_delivery: estDelivery ? format(estDelivery, "yyyy-MM-dd") : undefined,
      });
      toast({ title: "Shipment details saved" });
      setEditingOrder(null);
      fetchOrders();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setUpdatingOrder(null);
  };

  const startEditing = (order: VendorOrderItem["order"]) => {
    if (!order) return;
    setEditingOrder(order.id);
    setProviderInput(order.shipping_provider ?? "");
    setTrackingInput(order.tracking_id ?? "");
    setEstDelivery(order.estimated_delivery ? new Date(order.estimated_delivery) : undefined);
  };

  // Group items by order
  const orderMap = new Map<string, { order: VendorOrderItem["order"]; items: VendorOrderItem[] }>();
  items.forEach(item => {
    if (!item.order) return;
    const existing = orderMap.get(item.order_id);
    if (existing) {
      existing.items.push(item);
    } else {
      orderMap.set(item.order_id, { order: item.order, items: [item] });
    }
  });

  const allOrders = Array.from(orderMap.entries());
  const filterOrders = (status?: string) =>
    status ? allOrders.filter(([, v]) => v.order?.shipping_status === status) : allOrders;

  const ShippingStepIndicator = ({ currentStatus }: { currentStatus: string }) => {
    const currentIdx = SHIPPING_STATUSES.indexOf(currentStatus as ShippingStatus);
    return (
      <div className="flex items-center gap-1 mt-2">
        {SHIPPING_STATUSES.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={cn(
              "h-2 w-2 rounded-full",
              i <= currentIdx ? "bg-primary" : "bg-muted"
            )} />
            {i < SHIPPING_STATUSES.length - 1 && (
              <div className={cn("h-0.5 w-4", i < currentIdx ? "bg-primary" : "bg-muted")} />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderOrders = (filtered: typeof allOrders) => {
    if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    if (filtered.length === 0) return <p className="text-center py-12 text-muted-foreground">No orders found.</p>;

    return (
      <div className="space-y-4">
        {filtered.map(([orderId, { order, items: orderItems }]) => (
          <Card key={orderId}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-sm font-medium">Order #{orderId.slice(0, 8)}</CardTitle>
                  <p className="text-xs text-muted-foreground">{new Date(order!.created_at).toLocaleDateString()}</p>
                  <ShippingStepIndicator currentStatus={order!.shipping_status} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={statusColor[order!.shipping_status] ?? ""}>
                    {statusLabel[order!.shipping_status] ?? order!.shipping_status}
                  </Badge>
                  {order!.shipping_provider && (
                    <Badge variant="secondary" className="text-xs">
                      <Truck className="h-3 w-3 mr-1" /> {order!.shipping_provider}
                    </Badge>
                  )}
                  {order!.tracking_id && (
                    <Badge variant="secondary" className="text-xs font-mono">
                      <Navigation className="h-3 w-3 mr-1" /> {order!.tracking_id}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {/* Order items */}
              <div className="space-y-2">
                {orderItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3">
                    {item.image && (
                      <img src={item.image} alt={item.title} className="h-10 w-10 rounded object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{formatPrice(Number(item.price) * item.quantity)}</p>
                  </div>
                ))}
              </div>

              {/* Shipment editing */}
              {editingOrder === orderId ? (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Shipping Provider</Label>
                      <Select value={providerInput} onValueChange={setProviderInput}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select provider" /></SelectTrigger>
                        <SelectContent>
                          {PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Tracking ID</Label>
                      <Input className="mt-1" value={trackingInput} onChange={e => setTrackingInput(e.target.value)} placeholder="Enter tracking number" />
                    </div>
                    <div>
                      <Label className="text-xs">Estimated Delivery</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full mt-1 justify-start text-left font-normal", !estDelivery && "text-muted-foreground")}>
                            <CalendarIcon className="h-4 w-4 mr-2" />
                            {estDelivery ? format(estDelivery, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={estDelivery} onSelect={setEstDelivery} initialFocus className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveShipmentDetails(orderId)} disabled={updatingOrder === orderId}>
                      {updatingOrder === orderId ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingOrder(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => startEditing(order)}>
                    <MapPin className="h-3 w-3 mr-1" /> Edit Shipment
                  </Button>
                  {nextShippingStatus[order!.shipping_status] && (
                    <Button
                      size="sm"
                      disabled={updatingOrder === orderId}
                      onClick={() => advanceShipping(orderId, order!.shipping_status)}
                    >
                      {updatingOrder === orderId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          {order!.shipping_status === "pending" && <><Truck className="h-3 w-3 mr-1" /> Mark Shipped</>}
                          {order!.shipping_status === "shipped" && <><Truck className="h-3 w-3 mr-1" /> In Transit</>}
                          {order!.shipping_status === "in_transit" && <><Truck className="h-3 w-3 mr-1" /> Out for Delivery</>}
                          {order!.shipping_status === "out_for_delivery" && <><CheckCircle2 className="h-3 w-3 mr-1" /> Delivered</>}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}

              {order!.estimated_delivery && (
                <p className="text-xs text-muted-foreground">
                  <CalendarIcon className="inline h-3 w-3 mr-1" />
                  Est. delivery: {new Date(order!.estimated_delivery).toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground">Manage orders and shipments for your products.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {SHIPPING_STATUSES.map(s => (
          <Card key={s}>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{filterOrders(s).length}</p>
              <p className="text-xs text-muted-foreground capitalize">{statusLabel[s]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="all">
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">All ({allOrders.length})</TabsTrigger>
          {SHIPPING_STATUSES.map(s => (
            <TabsTrigger key={s} value={s}>{statusLabel[s]}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="all" className="mt-4">{renderOrders(filterOrders())}</TabsContent>
        {SHIPPING_STATUSES.map(s => (
          <TabsContent key={s} value={s} className="mt-4">{renderOrders(filterOrders(s))}</TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default VendorOrders;
