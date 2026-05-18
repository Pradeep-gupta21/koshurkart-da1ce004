import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { orderService } from "@/services/orderService";
import { notificationService } from "@/services/notificationService";
import { paymentService } from "@/services/paymentService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, ShoppingCart, LogOut, Store, ChevronDown, ChevronUp, Package, Truck, CalendarIcon, MapPin, CheckCircle2, Clock, Bell, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShippingStatus } from "@/types/order";
import type { AppNotification } from "@/types/notification";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useToast } from "@/hooks/use-toast";
import SavedAddresses from "@/components/location/SavedAddresses";
import { useCurrency } from "@/contexts/CurrencyContext";

const statusColor: Record<string, string> = {
  processing: "bg-warning/15 text-warning border-warning/30",
  shipped: "bg-primary/15 text-primary border-primary/30",
  delivered: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  pending: "bg-muted text-muted-foreground",
  completed: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  in_transit: "bg-accent/15 text-accent-foreground border-accent/30",
  out_for_delivery: "bg-warning/15 text-warning border-warning/30",
};

const SHIPPING_STATUSES: ShippingStatus[] = ["pending", "shipped", "in_transit", "out_for_delivery", "delivered"];

const statusLabel: Record<string, string> = {
  pending: "Pending",
  shipped: "Shipped",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
};

const statusIcon: Record<string, typeof Package> = {
  pending: Clock,
  shipped: Package,
  in_transit: Truck,
  out_for_delivery: MapPin,
  delivered: CheckCircle2,
};

const DeliveryProgressTracker = ({ currentStatus }: { currentStatus: string }) => {
  const currentIdx = SHIPPING_STATUSES.indexOf(currentStatus as ShippingStatus);
  return (
    <div className="flex items-center justify-between w-full my-3">
      {SHIPPING_STATUSES.map((s, i) => {
        const Icon = statusIcon[s] ?? Package;
        const isActive = i <= currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center border-2 transition-colors",
                isCurrent ? "border-primary bg-primary text-primary-foreground" :
                isActive ? "border-primary bg-primary/10 text-primary" :
                "border-muted bg-muted text-muted-foreground"
              )}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={cn(
                "text-[10px] mt-1 text-center leading-tight",
                isActive ? "text-foreground font-medium" : "text-muted-foreground"
              )}>
                {statusLabel[s]}
              </span>
            </div>
            {i < SHIPPING_STATUSES.length - 1 && (
              <div className={cn("h-0.5 flex-1 mx-1 mt-[-12px]", i < currentIdx ? "bg-primary" : "bg-muted")} />
            )}
          </div>
        );
      })}
    </div>
  );
};

const TrackingTimeline = ({ orderId }: { orderId: string }) => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orderService.getShipmentEvents(orderId).then(data => {
      setEvents(data);
      setLoading(false);
    });
  }, [orderId]);

  if (loading) return <div className="flex justify-center py-3"><div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (events.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-muted-foreground mb-2">Tracking History</p>
      <div className="space-y-0">
        {events.map((ev, i) => (
          <div key={ev.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn(
                "h-2.5 w-2.5 rounded-full mt-1.5",
                i === events.length - 1 ? "bg-primary" : "bg-muted-foreground/40"
              )} />
              {i < events.length - 1 && <div className="w-px flex-1 bg-border" />}
            </div>
            <div className="pb-3">
              <p className="text-xs font-medium">{ev.description || statusLabel[ev.status] || ev.status}</p>
              <p className="text-[10px] text-muted-foreground">
                {new Date(ev.created_at).toLocaleString()}
                {ev.location && <> · {ev.location}</>}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const typeIcon: Record<string, string> = {
  order_placed: "🛒",
  order_shipped: "📦",
  order_delivered: "✅",
  vendor_verified: "🛡️",
  review_submitted: "⭐",
};

const ProfilePage = () => {
  const { user, loading, isVendor, signOut } = useAuth();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [payments, setPayments] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [profRes, orderData, notifs] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        orderService.getUserOrders(user.id),
        notificationService.getUserNotifications(user.id, 10),
      ]);
      setProfile(profRes.data);
      setOrders(orderData);
      setNotifications(notifs);

      // Fetch payments for each order
      const paymentMap: Record<string, any> = {};
      await Promise.all(
        orderData.map(async (o: any) => {
          const p = await paymentService.getPaymentByOrder(o.id);
          if (p) paymentMap[o.id] = p;
        })
      );
      setPayments(paymentMap);
    };
    fetchData();
  }, [user]);

  // Real-time order status updates
  const handleOrderUpdate = useCallback(async () => {
    if (!user) return;
    const orderData = await orderService.getUserOrders(user.id);
    setOrders(orderData);
    toast({ title: "📦 Order updated", description: "Your order status has changed." });
  }, [user, toast]);

  useRealtimeSubscription({
    table: "orders",
    event: "UPDATE",
    filter: user ? `user_id=eq.${user.id}` : undefined,
    onPayload: handleOrderUpdate,
    enabled: !!user,
  });

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      <Card className="marketplace-shadow">
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center">
            <User className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <CardTitle>{profile?.name || "User"}</CardTitle>
            <p className="text-sm text-muted-foreground">{profile?.email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </CardHeader>
      </Card>

      {isVendor && (
        <Card className="marketplace-shadow border-primary/20">
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Store className="h-5 w-5 text-primary" />
              <span className="font-medium">Vendor Dashboard</span>
            </div>
            <Button asChild size="sm"><Link to="/vendor">Open Dashboard</Link></Button>
          </CardContent>
        </Card>
      )}

      <Card className="marketplace-shadow">
        <CardContent className="py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-primary" />
            <div>
              <div className="font-medium">My Payments</div>
              <div className="text-xs text-muted-foreground">UPI verification status and retry failed payments</div>
            </div>
          </div>
          <Button asChild size="sm" variant="outline"><Link to="/payments">View</Link></Button>
        </CardContent>
      </Card>


      {/* Notifications */}
      <Card className="marketplace-shadow">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" /> Recent Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No notifications yet</p>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <div key={n.id} className={cn(
                  "flex gap-3 p-3 rounded-lg",
                  !n.isRead ? "bg-primary/5" : "bg-muted/30"
                )}>
                  <span className="text-lg shrink-0">{typeIcon[n.type] ?? "🔔"}</span>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm", !n.isRead && "font-medium")}>{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SavedAddresses />

      <Card className="marketplace-shadow">
        <CardHeader><CardTitle className="text-lg">Order History</CardTitle></CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="text-center py-8">
              <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No orders yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o: any) => (
                <div key={o.id} className="border rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
                    onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">Order #{o.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{formatPrice(Number(o.total_amount))}</p>
                        <div className="flex gap-1.5 mt-0.5 justify-end">
                          <Badge variant="outline" className={`text-[10px] ${statusColor[o.shipping_status] ?? statusColor[o.order_status] ?? ""}`}>
                            {statusLabel[o.shipping_status] ?? o.order_status}
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] ${statusColor[o.payment_status] ?? ""}`}>
                            {o.payment_status}
                          </Badge>
                        </div>
                      </div>
                      {expanded === o.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </button>
                  {expanded === o.id && (
                    <div className="border-t bg-muted/30 p-4 space-y-3">
                      {/* Delivery progress tracker */}
                      <DeliveryProgressTracker currentStatus={o.shipping_status ?? "pending"} />

                      {/* Payment info */}
                      {payments[o.id] && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                          <CreditCard className="h-3.5 w-3.5" />
                          <span className="capitalize font-medium">{payments[o.id].payment_method}</span>
                          <span>·</span>
                          <Badge variant="outline" className={`text-[10px] ${statusColor[payments[o.id].payment_status] ?? ''}`}>
                            {payments[o.id].payment_status}
                          </Badge>
                          {payments[o.id].transaction_id && (
                            <>
                              <span>·</span>
                              <span className="font-mono">{payments[o.id].transaction_id}</span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Shipping info */}
                      <div className="flex flex-wrap gap-3 text-xs">
                        {o.shipping_provider && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Truck className="h-3 w-3" /> {o.shipping_provider}
                          </span>
                        )}
                        {o.tracking_id && (
                          <span className="flex items-center gap-1 text-muted-foreground font-mono">
                            <Package className="h-3 w-3" /> {o.tracking_id}
                          </span>
                        )}
                        {o.estimated_delivery && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <CalendarIcon className="h-3 w-3" /> Est. {new Date(o.estimated_delivery).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {/* Order items */}
                      {o.order_items && o.order_items.map((item: any) => (
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

                      {/* Tracking history timeline */}
                      <TrackingTimeline orderId={o.id} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;
