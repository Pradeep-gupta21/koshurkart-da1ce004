import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Star, ShieldAlert, CheckCircle, Ban, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  is_verified_purchase: boolean | null;
  is_suspicious: boolean | null;
  flagged_reason: string | null;
  moderation_status: string | null;
  user_id: string;
  product_id: string;
  profiles: { name: string; email: string } | null;
  products: { title: string } | null;
}

interface VendorLeaderRow {
  id: string;
  store_name: string;
  review_rating: number | null;
  total_sales: number | null;
}

const AdminReviews = () => {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [topVendors, setTopVendors] = useState<VendorLeaderRow[]>([]);
  const [bottomVendors, setBottomVendors] = useState<VendorLeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchReviews = async () => {
    const { data: base } = await supabase.rpc("list_reviews_admin", { _limit: 200 } as any);
    const rows = (base as any[]) ?? [];

    // Hydrate profile + product info using separate queries (RPC returns plain columns).
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    const productIds = Array.from(new Set(rows.map((r) => r.product_id).filter(Boolean)));

    const [{ data: profiles }, { data: products }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, name, email").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      productIds.length
        ? supabase.from("products").select("id, title").in("id", productIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const productMap = new Map((products ?? []).map((p: any) => [p.id, p]));

    setReviews(
      rows.map((r) => ({
        ...r,
        profiles: profileMap.get(r.user_id) ?? null,
        products: productMap.get(r.product_id) ?? null,
      })) as ReviewRow[],
    );
    setLoading(false);
  };

  const fetchLeaderboard = async () => {
    const { data: top } = await supabase
      .from("vendors")
      .select("id, store_name, review_rating, total_sales")
      .gt("review_rating", 0)
      .order("review_rating", { ascending: false })
      .limit(5);
    const { data: bottom } = await supabase
      .from("vendors")
      .select("id, store_name, review_rating, total_sales")
      .gt("review_rating", 0)
      .order("review_rating", { ascending: true })
      .limit(5);
    setTopVendors((top ?? []) as VendorLeaderRow[]);
    setBottomVendors((bottom ?? []) as VendorLeaderRow[]);
  };

  useEffect(() => { fetchReviews(); fetchLeaderboard(); }, []);

  const suspiciousReviews = reviews.filter((r) => r.is_suspicious);
  const pendingCount = reviews.filter((r) => r.moderation_status === "pending" && r.is_suspicious).length;

  const handleApprove = async (id: string) => {
    setActionId(id);
    const { error } = await supabase
      .from("reviews")
      .update({ moderation_status: "approved", is_suspicious: false } as any)
      .eq("id", id);
    setActionId(null);
    if (error) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Review approved" });
    fetchReviews();
  };

  const handleRemove = async (id: string) => {
    setActionId(id);
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    setActionId(null);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Review removed" });
    fetchReviews();
  };

  const handleBanUser = async (userId: string) => {
    setActionId(userId);
    const { error } = await supabase.from("reviews").delete().eq("user_id", userId);
    setActionId(null);
    if (error) {
      toast({ title: "Ban failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "All reviews from this user removed" });
    fetchReviews();
  };

  const handleWarnVendor = (productTitle: string) => {
    toast({ title: "Vendor warned", description: `Warning sent regarding "${productTitle}".` });
  };

  const reasonCount = (reason: string | null) => reason ? reason.split(";").length : 0;

  const ReviewCard = ({ r }: { r: ReviewRow }) => {
    const multiFlag = reasonCount(r.flagged_reason) > 1;
    return (
      <Card className={
        r.is_suspicious
          ? multiFlag
            ? "border-destructive/50 bg-destructive/5"
            : "border-warning/50 bg-warning/5"
          : ""
      }>
        <CardContent className="flex items-start justify-between gap-4 py-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-foreground text-sm">
                {r.profiles?.name || r.profiles?.email || "Unknown"}
              </span>
              <span className="text-muted-foreground text-xs">on</span>
              <span className="font-medium text-foreground text-sm truncate">
                {r.products?.title || "Unknown product"}
              </span>
              {r.is_verified_purchase && <Badge variant="secondary" className="text-xs">Verified</Badge>}
              {r.is_suspicious && (
                <Badge variant="destructive" className="text-xs">
                  <ShieldAlert className="h-3 w-3 mr-1" /> Suspicious
                </Badge>
              )}
              {r.moderation_status === "approved" && (
                <Badge variant="outline" className="text-xs text-success border-success">Approved</Badge>
              )}
              {r.moderation_status === "rejected" && (
                <Badge variant="outline" className="text-xs text-destructive border-destructive">Rejected</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`h-3 w-3 ${i < r.rating ? "text-warning fill-warning" : "text-muted-foreground"}`} />
              ))}
              <span className="text-xs text-muted-foreground ml-2">
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </div>
            {r.comment && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.comment}</p>}
            {r.flagged_reason && (
              <div className="mt-2 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-700 dark:text-yellow-400">{r.flagged_reason}</p>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            {r.is_suspicious && r.moderation_status === "pending" && (
              <Button size="sm" variant="outline" onClick={() => handleApprove(r.id)} disabled={actionId === r.id}>
                <CheckCircle className="h-4 w-4 mr-1" /> Approve
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={() => handleRemove(r.id)} disabled={actionId === r.id}>
              <Trash2 className="h-4 w-4 mr-1" /> Remove
            </Button>
            {r.is_suspicious && (
              <>
                <Button size="sm" variant="outline" className="text-destructive border-destructive hover:bg-destructive/10" onClick={() => handleBanUser(r.user_id)} disabled={actionId === r.user_id}>
                  <Ban className="h-4 w-4 mr-1" /> Ban User
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleWarnVendor(r.products?.title || "product")}>
                  <AlertTriangle className="h-4 w-4 mr-1" /> Warn Vendor
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderList = (list: ReviewRow[]) =>
    list.length === 0 ? (
      <p className="text-muted-foreground">No reviews found.</p>
    ) : (
      <div className="space-y-3">{list.map((r) => <ReviewCard key={r.id} r={r} />)}</div>
    );

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-4">Review Moderation</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Reviews</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-foreground">{reviews.length}</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/30">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-yellow-600">Suspicious</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-yellow-600">{suspiciousReviews.length}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-destructive">Pending Moderation</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-destructive">{pendingCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Vendor Leaderboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Star className="h-4 w-4 text-warning fill-warning" /> Top Rated Vendors
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {topVendors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rated vendors yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {topVendors.map((v, idx) => (
                  <li key={v.id} className="flex items-center justify-between text-sm">
                    <span className="truncate"><span className="text-muted-foreground mr-2">#{idx + 1}</span>{v.store_name}</span>
                    <span className="font-semibold text-foreground tabular-nums">{Number(v.review_rating ?? 0).toFixed(2)} ★</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Lowest Rated Vendors
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {bottomVendors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rated vendors yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {bottomVendors.map((v, idx) => (
                  <li key={v.id} className="flex items-center justify-between text-sm">
                    <span className="truncate"><span className="text-muted-foreground mr-2">#{idx + 1}</span>{v.store_name}</span>
                    <span className="font-semibold text-destructive tabular-nums">{Number(v.review_rating ?? 0).toFixed(2)} ★</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>



      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : (
        <Tabs defaultValue="suspicious">
          <TabsList>
            <TabsTrigger value="suspicious" className="gap-1.5">
              <ShieldAlert className="h-4 w-4" /> Suspicious
              {suspiciousReviews.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">{suspiciousReviews.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">All Reviews</TabsTrigger>
          </TabsList>
          <TabsContent value="suspicious" className="mt-4">
            {renderList(suspiciousReviews)}
          </TabsContent>
          <TabsContent value="all" className="mt-4">
            {renderList(reviews)}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default AdminReviews;
