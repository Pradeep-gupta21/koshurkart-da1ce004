import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { pricingService, PricingRule } from "@/services/pricingService";
import { RefreshCw, Save, Plus } from "lucide-react";

const AdminPricing = () => {
  const { toast } = useToast();
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PricingRule>>({});

  const fetchRules = async () => {
    try {
      setLoading(true);
      const data = await pricingService.getPricingRules();
      setRules(data);
    } catch {
      toast({ title: "Error", description: "Failed to load pricing rules", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRules(); }, []);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await pricingService.recalculatePrices();
      toast({ title: "Success", description: "Dynamic prices recalculated for all products." });
    } catch {
      toast({ title: "Error", description: "Failed to recalculate prices", variant: "destructive" });
    } finally {
      setRecalculating(false);
    }
  };

  const startEdit = (rule: PricingRule) => {
    setEditingId(rule.id);
    setEditForm({ ...rule });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await pricingService.updatePricingRule(editingId, editForm);
      toast({ title: "Saved", description: "Pricing rule updated." });
      setEditingId(null);
      fetchRules();
    } catch {
      toast({ title: "Error", description: "Failed to save rule", variant: "destructive" });
    }
  };

  const createRule = async () => {
    try {
      await pricingService.createPricingRule({ rule_name: "New Rule", is_active: false });
      toast({ title: "Created", description: "New pricing rule created." });
      fetchRules();
    } catch {
      toast({ title: "Error", description: "Failed to create rule", variant: "destructive" });
    }
  };

  const toggleActive = async (rule: PricingRule) => {
    try {
      await pricingService.updatePricingRule(rule.id, { is_active: !rule.is_active });
      fetchRules();
    } catch {
      toast({ title: "Error", description: "Failed to toggle rule", variant: "destructive" });
    }
  };

  const fields: { key: keyof PricingRule; label: string; type: "number" }[] = [
    { key: "high_demand_multiplier", label: "High Demand Multiplier", type: "number" },
    { key: "low_demand_multiplier", label: "Low Demand Multiplier", type: "number" },
    { key: "low_stock_multiplier", label: "Low Stock Multiplier", type: "number" },
    { key: "high_stock_multiplier", label: "High Stock Multiplier", type: "number" },
    { key: "max_increase_pct", label: "Max Increase %", type: "number" },
    { key: "max_decrease_pct", label: "Max Decrease %", type: "number" },
    { key: "demand_threshold_high", label: "High Demand Threshold", type: "number" },
    { key: "demand_threshold_low", label: "Low Demand Threshold", type: "number" },
    { key: "stock_threshold_high", label: "High Stock Threshold", type: "number" },
    { key: "stock_threshold_low", label: "Low Stock Threshold", type: "number" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dynamic Pricing Rules</h1>
          <p className="text-muted-foreground">Configure how product prices adjust based on demand and stock levels.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={createRule}>
            <Plus className="h-4 w-4 mr-1" /> New Rule
          </Button>
          <Button onClick={handleRecalculate} disabled={recalculating}>
            <RefreshCw className={`h-4 w-4 mr-1 ${recalculating ? "animate-spin" : ""}`} />
            Recalculate All Prices
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading rules...</p>
      ) : rules.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No pricing rules found.</CardContent></Card>
      ) : (
        rules.map((rule) => (
          <Card key={rule.id} className="marketplace-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-3">
                <CardTitle className="text-lg">{rule.rule_name}</CardTitle>
                <Badge variant={rule.is_active ? "default" : "secondary"}>
                  {rule.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={rule.is_active} onCheckedChange={() => toggleActive(rule)} />
                {editingId === rule.id ? (
                  <Button size="sm" onClick={saveEdit}><Save className="h-4 w-4 mr-1" /> Save</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => startEdit(rule)}>Edit</Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {fields.map(({ key, label }) => (
                  <div key={key}>
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    {editingId === rule.id ? (
                      <Input
                        type="number"
                        step="0.01"
                        value={editForm[key] as number ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, [key]: Number(e.target.value) })}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-semibold mt-1">{Number(rule[key])}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
};

export default AdminPricing;
