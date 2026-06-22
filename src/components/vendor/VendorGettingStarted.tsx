import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, ImageIcon, Package, Sparkles, Truck, X } from "lucide-react";

interface Props {
  vendorId: string;
}

interface ChecklistItem {
  key: string;
  title: string;
  description: string;
  done: boolean;
  icon: React.ComponentType<{ className?: string }>;
  ctaLabel: string;
  ctaTo: string;
  passive?: boolean;
}

/**
 * First-time vendor onboarding checklist. Shown until all 4 steps are complete
 * or explicitly dismissed by the vendor.
 */
const VendorGettingStarted = ({ vendorId }: Props) => {
  const dismissKey = `vendor_getting_started_dismissed_${vendorId}`;
  const [hidden, setHidden] = useState<boolean>(() => {
    try { return localStorage.getItem(dismissKey) === "1"; } catch { return false; }
  });
  const [loading, setLoading] = useState(true);
  const [hasLogo, setHasLogo] = useState(false);
  const [hasDescription, setHasDescription] = useState(false);
  const [productCount, setProductCount] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [serviceabilityCount, setServiceabilityCount] = useState(0);

  useEffect(() => {
    if (!vendorId || hidden) return;
    let cancelled = false;
    (async () => {
      const [vendorRes, prodRes, orderRes, svcRes] = await Promise.all([
        supabase.from("vendors").select("logo, description").eq("id", vendorId).single(),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId),
        supabase.from("order_items").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId),
        supabase.from("vendor_serviceability").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId),
      ]);
      if (cancelled) return;
      setHasLogo(!!vendorRes.data?.logo);
      setHasDescription(!!(vendorRes.data?.description && String(vendorRes.data.description).trim().length > 0));
      setProductCount(prodRes.count ?? 0);
      setOrderCount(orderRes.count ?? 0);
      setServiceabilityCount(svcRes.count ?? 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [vendorId, hidden]);

  const items: ChecklistItem[] = useMemo(() => [
    {
      key: "storefront",
      title: "Complete your storefront",
      description: "Add a logo and a store description so customers recognize your store.",
      done: hasLogo && hasDescription,
      icon: ImageIcon,
      ctaLabel: "Edit storefront",
      ctaTo: "/vendor/settings",
    },
    {
      key: "product",
      title: "Add your first product",
      description: "Create a listing — title, photos, price, and stock.",
      done: productCount > 0,
      icon: Package,
      ctaLabel: "Add product",
      ctaTo: "/vendor/products",
    },
    {
      key: "shipping",
      title: "Set shipping pincodes",
      description: "Tell us where you ship so customers see accurate delivery info.",
      done: serviceabilityCount > 0,
      icon: Truck,
      ctaLabel: "Set shipping",
      ctaTo: "/vendor/settings#serviceability",
    },
    {
      key: "order",
      title: "Receive your first order",
      description: "Once a customer buys, you'll see it here automatically.",
      done: orderCount > 0,
      icon: Sparkles,
      ctaLabel: "Share your store",
      ctaTo: "/vendor/products",
      passive: true,
    },
  ], [hasLogo, hasDescription, productCount, serviceabilityCount, orderCount]);

  if (hidden || loading) return null;

  const completed = items.filter((i) => i.done).length;
  const total = items.length;
  if (completed === total) return null;

  const dismiss = () => {
    try { localStorage.setItem(dismissKey, "1"); } catch {}
    setHidden(true);
  };

  return (
    <Card className="marketplace-shadow border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card relative overflow-hidden">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss getting started"
        className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          Get your store ready
        </CardTitle>
        <div className="space-y-1.5 mt-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{completed} of {total} complete</span>
            <span>{Math.round((completed / total) * 100)}%</span>
          </div>
          <Progress value={(completed / total) * 100} className="h-1.5" />
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.key}
                className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${item.done ? "bg-muted/40 border-border" : "bg-background border-border hover:border-primary/40"}`}
              >
                <div className="shrink-0 mt-0.5">
                  {item.done ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className={`text-sm font-medium ${item.done ? "line-through text-muted-foreground" : ""}`}>
                      {item.title}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                {!item.done && !item.passive && (
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link to={item.ctaTo}>{item.ctaLabel}</Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};

export default VendorGettingStarted;
