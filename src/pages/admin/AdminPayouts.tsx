import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle } from "lucide-react";

interface Payout {
  id: string;
  vendor_id: string;
  amount: number;
  status: string;
  requested_at: string;
  processed_at: string | null;
  store_name?: string;
}

const AdminPayouts = () => {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchPayouts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payouts")
      .select("*, vendors(store_name)")
      .order("requested_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading payouts", variant: "destructive" });
      setLoading(false);
      return;
    }

    const mapped = (data ?? []).map((p: any) => ({
      ...p,
      store_name: p.vendors?.store_name ?? "Unknown",
    }));
    setPayouts(mapped);
    setLoading(false);
  };

  useEffect(() => { fetchPayouts(); }, []);

  const updateStatus = async (id: string, status: "completed" | "rejected") => {
    const { error } = await supabase
      .from("payouts")
      .update({ status, processed_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Payout ${status}` });
    fetchPayouts();
  };

  const filterPayouts = (status: string) =>
    status === "all" ? payouts : payouts.filter(p => p.status === status);

  const PayoutList = ({ items }: { items: Payout[] }) => (
    items.length === 0 ? (
      <p className="text-muted-foreground text-sm py-4">No payouts found.</p>
    ) : (
      <div className="space-y-3">
        {items.map(p => (
          <div key={p.id} className="flex items-center justify-between py-3 border-b last:border-0">
            <div className="space-y-1">
              <p className="font-medium text-sm">{p.store_name}</p>
              <p className="text-lg font-bold">${Number(p.amount).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                Requested: {new Date(p.requested_at).toLocaleDateString()}
                {p.processed_at && ` • Processed: ${new Date(p.processed_at).toLocaleDateString()}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-full ${
                p.status === 'completed' ? 'bg-secondary/10 text-secondary' :
                p.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                'bg-accent/10 text-accent-foreground'
              }`}>
                {p.status}
              </span>
              {p.status === "pending" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => updateStatus(p.id, "completed")}>
                    <CheckCircle className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => updateStatus(p.id, "rejected")}>
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payout Management</h1>
        <p className="text-muted-foreground">Review and process vendor payout requests</p>
      </div>

      <Card className="marketplace-shadow">
        <CardContent className="pt-6">
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending">Pending ({filterPayouts("pending").length})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({filterPayouts("completed").length})</TabsTrigger>
              <TabsTrigger value="rejected">Rejected ({filterPayouts("rejected").length})</TabsTrigger>
              <TabsTrigger value="all">All ({payouts.length})</TabsTrigger>
            </TabsList>
            {["pending", "completed", "rejected", "all"].map(tab => (
              <TabsContent key={tab} value={tab}>
                <PayoutList items={filterPayouts(tab)} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPayouts;
