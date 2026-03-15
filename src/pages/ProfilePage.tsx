import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, ShoppingCart, LogOut, Store } from "lucide-react";

const ProfilePage = () => {
  const { user, loading, isVendor, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [profRes, orderRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      ]);
      setProfile(profRes.data);
      setOrders(orderRes.data ?? []);
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
              {orders.map(o => (
                <div key={o.id} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">Order #{o.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">${Number(o.total_amount).toFixed(2)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${o.order_status === 'delivered' ? 'bg-secondary/10 text-secondary' : 'bg-muted text-muted-foreground'}`}>
                      {o.order_status}
                    </span>
                  </div>
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
