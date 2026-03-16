import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Star } from "lucide-react";

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  is_verified_purchase: boolean | null;
  user_id: string;
  product_id: string;
  profiles: { name: string; email: string } | null;
  products: { title: string } | null;
}

const AdminReviews = () => {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchReviews = async () => {
    const { data } = await supabase
      .from("reviews")
      .select("*, profiles:user_id(name, email), products:product_id(title)")
      .order("created_at", { ascending: false })
      .limit(100);
    setReviews((data as unknown as ReviewRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchReviews(); }, []);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    setDeleting(null);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Review removed" });
    fetchReviews();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Review Moderation</h1>
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : reviews.length === 0 ? (
        <p className="text-muted-foreground">No reviews found.</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-start justify-between gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground text-sm">{r.profiles?.name || r.profiles?.email || "Unknown"}</span>
                    <span className="text-muted-foreground text-xs">on</span>
                    <span className="font-medium text-foreground text-sm truncate">{r.products?.title || "Unknown product"}</span>
                    {r.is_verified_purchase && <Badge variant="secondary" className="text-xs">Verified</Badge>}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-3 w-3 ${i < r.rating ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                    ))}
                    <span className="text-xs text-muted-foreground ml-2">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  {r.comment && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.comment}</p>}
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDelete(r.id)}
                  disabled={deleting === r.id}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminReviews;
