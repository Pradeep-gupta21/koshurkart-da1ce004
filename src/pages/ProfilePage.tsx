import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { orderService } from "@/services/orderService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, ShoppingCart, LogOut, Store, ChevronDown, ChevronUp, Package } from "lucide-react";

const statusColor: Record<string, string> = {
  processing: "bg-warning/15 text-warning border-warning/30",
  shipped: "bg-primary/15 text-primary border-primary/30",
  delivered: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  pending: "bg-muted text-muted-foreground",
  completed: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
};

const ProfilePage = () => {
  const { user, loading, isVendor, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [profRes, orderData] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        orderService.getUserOrders(user.id),
      ]);
      setProfile(profRes.data);
      setOrders(orderData);
    };
    fetchData();
  }, [user]);

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
                        <p className="font-semibold tabular-nums">${Number(o.total_amount).toFixed(2)}</p>
                        <div className="flex gap-1.5 mt-0.5 justify-end">
                          <Badge variant="outline" className={`text-[10px] ${statusColor[o.order_status] ?? ""}`}>
                            {o.order_status}
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] ${statusColor[o.payment_status] ?? ""}`}>
                            {o.payment_status}
                          </Badge>
                        </div>
                      </div>
                      {expanded === o.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </button>
                  {expanded === o.id && o.order_items && (
                    <div className="border-t bg-muted/30 p-4 space-y-2">
                      {o.order_items.map((item: any) => (
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
