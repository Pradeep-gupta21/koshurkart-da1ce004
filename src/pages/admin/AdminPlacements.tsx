import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Save, LayoutGrid } from "lucide-react";

interface Placement {
  id: string;
  placement_name: string;
  price_per_click: number | null;
  price_per_impression: number | null;
  is_active: boolean | null;
}

const AdminPlacements = () => {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<Placement>>>({});
  const { toast } = useToast();

  const fetch = async () => {
    const { data } = await supabase.from("ad_placements").select("*").order("placement_name");
    setPlacements((data as Placement[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const handleEdit = (id: string, field: keyof Placement, value: any) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleSave = async (id: string) => {
    const changes = edits[id];
    if (!changes) return;
    setSaving(id);
    const { error } = await supabase.from("ad_placements").update(changes).eq("id", id);
    setSaving(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Placement updated" });
    setEdits((prev) => { const n = { ...prev }; delete n[id]; return n; });
    fetch();
  };

  const toggleActive = async (id: string, current: boolean | null) => {
    const newVal = !(current ?? true);
    const { error } = await supabase.from("ad_placements").update({ is_active: newVal }).eq("id", id);
    if (error) {
      toast({ title: "Toggle failed", description: error.message, variant: "destructive" });
      return;
    }
    fetch();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Ad Placement Pricing</h1>
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : placements.length === 0 ? (
        <p className="text-muted-foreground">No ad placements configured.</p>
      ) : (
        <div className="space-y-3">
          {placements.map((p) => {
            const e = edits[p.id] ?? {};
            return (
              <Card key={p.id}>
                <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      <LayoutGrid className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{p.placement_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Switch
                          checked={p.is_active ?? true}
                          onCheckedChange={() => toggleActive(p.id, p.is_active)}
                        />
                        <span className="text-xs text-muted-foreground">{p.is_active ? "Active" : "Inactive"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">CPC ($)</label>
                      <Input
                        type="number"
                        step="0.01"
                        className="w-24"
                        defaultValue={p.price_per_click ?? 0}
                        onChange={(ev) => handleEdit(p.id, "price_per_click", Number(ev.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">CPM ($)</label>
                      <Input
                        type="number"
                        step="0.01"
                        className="w-24"
                        defaultValue={p.price_per_impression ?? 0}
                        onChange={(ev) => handleEdit(p.id, "price_per_impression", Number(ev.target.value))}
                      />
                    </div>
                    {edits[p.id] && (
                      <Button size="sm" onClick={() => handleSave(p.id)} disabled={saving === p.id}>
                        <Save className="h-4 w-4 mr-1" /> Save
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminPlacements;
