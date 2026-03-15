import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Package, Truck, CheckCircle2, Loader2 } from "lucide-react";

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
  };
}

const statusColor: Record<string, string> = {
  processing: "bg-warning/15 text-warning border-warning/30",
  shipped: "bg-primary/15 text-primary border-primary/30",
  delivered: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

const VendorOrders = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const { toast } = useToast();
  const [items, setItems] = useState<VendorOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingOrder, setUpdatingOrder] = useState<string | null>(null);

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

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    setUpdatingOrder(orderId);
    const { error } = await supabase
      .from("orders")
      .update({ order_status: newStatus })
      .eq("id", orderId);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Order updated", description: `Status changed to ${newStatus}.` });
      fetchOrders();
    }
    setUpdatingOrder(null);
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
    status ? allOrders.filter(([, v]) => v.order?.order_status === status) : allOrders;

  const nextStatus: Record<string, string> = { processing: "shipped", shipped: "delivered" };

  const renderOrders = (filtered: typeof allOrders) => {
    if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    if (filtered.length === 0) return <p className="text-center py-12 text-muted-foreground">No orders found.</p>;

    return (
      <div className="space-y-4">
        {filtered.map(([orderId, { order, items: orderItems }]) => (
          <Card key={orderId}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">Order #{orderId.slice(0, 8)}</CardTitle>
                  <p className="text-xs text-muted-foreground">{new Date(order!.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={statusColor[order!.order_status] ?? ""}>
                    {order!.order_status}
                  </Badge>
                  {nextStatus[order!.order_status] && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingOrder === orderId}
                      onClick={() => updateOrderStatus(orderId, nextStatus[order!.order_status])}
                    >
                      {updatingOrder === orderId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : order!.order_status === "processing" ? (
                        <><Truck className="h-3 w-3 mr-1" /> Ship</>
                      ) : (
                        <><CheckCircle2 className="h-3 w-3 mr-1" /> Deliver</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
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
                    <p className="text-sm font-semibold tabular-nums">${(Number(item.price) * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>
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
        <p className="text-muted-foreground">Manage orders containing your products.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Package className="h-6 w-6 mx-auto text-warning mb-1" />
            <p className="text-2xl font-bold">{filterOrders("processing").length}</p>
            <p className="text-xs text-muted-foreground">Processing</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Truck className="h-6 w-6 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{filterOrders("shipped").length}</p>
            <p className="text-xs text-muted-foreground">Shipped</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-6 w-6 mx-auto text-success mb-1" />
            <p className="text-2xl font-bold">{filterOrders("delivered").length}</p>
            <p className="text-xs text-muted-foreground">Delivered</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({allOrders.length})</TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
          <TabsTrigger value="shipped">Shipped</TabsTrigger>
          <TabsTrigger value="delivered">Delivered</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">{renderOrders(filterOrders())}</TabsContent>
        <TabsContent value="processing" className="mt-4">{renderOrders(filterOrders("processing"))}</TabsContent>
        <TabsContent value="shipped" className="mt-4">{renderOrders(filterOrders("shipped"))}</TabsContent>
        <TabsContent value="delivered" className="mt-4">{renderOrders(filterOrders("delivered"))}</TabsContent>
      </Tabs>
    </div>
  );
};

export default VendorOrders;
