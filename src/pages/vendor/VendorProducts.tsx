import { useState, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ServiceFactory } from "@/services/commerce/di/ServiceFactory";
import { Plus, Pencil, Trash2, Package, Upload, X, Image as ImageIcon, AlertTriangle, Banknote, AlertCircle, CheckCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useCurrency } from "@/contexts/CurrencyContext";
import { MARKETPLACE_CATEGORIES, formatCategoryLabel } from "@/config/categories";

const categories = MARKETPLACE_CATEGORIES;
const DEFAULT_CATEGORY = categories[0].slug;
const statusOptions = [
  { value: "active", label: "Active", variant: "default" as const },
  { value: "draft", label: "Draft", variant: "secondary" as const },
  { value: "archived", label: "Archived", variant: "outline" as const },
];

const VendorProducts = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Gate product creation behind payment setup
  const { data: vendorPaymentStatus, isLoading: isLoadingPaymentStatus, error: paymentStatusQueryError } = useQuery({
    queryKey: ['vendor-payment-status', vendorId],
    queryFn: async () => {
      const { data, error } = await (await import("@/integrations/supabase/client")).supabase
        .from("vendors")
        .select("payment_setup_completed")
        .eq("id", vendorId)
        .single();
      if (error) throw error;
      return { paymentSetupCompleted: data?.payment_setup_completed ?? false };
    },
    enabled: !!vendorId,
  });
  const paymentSetupCompleted = vendorPaymentStatus?.paymentSetupCompleted ?? false;
  const paymentStatusError = paymentStatusQueryError ? "Unable to load payment setup status. Please refresh." : null;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: "", description: "", price: "", discountPrice: "", stock: "", lowStockThreshold: "5", category: DEFAULT_CATEGORY, status: "active", allowCod: true,
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['vendor-products', vendorId],
    queryFn: async () => {
      const result = await ServiceFactory.getProductService().getByVendor(vendorId);
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    enabled: !!vendorId,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const result = await ServiceFactory.getProductService().create(payload);
      if (!result.success) throw result.error;
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-products', vendorId] });
      toast({ title: "Product created" });
      closeDialog();
    },
    onError: (e: any) => {
      if (e.status === 403 || e.code === '42501' || e.message?.includes('RLS')) {
        const errorMessage = e.message?.toLowerCase() || '';
        const errorDetails = e.details?.toLowerCase() || '';
        
        if (
          errorMessage.includes('payment') || 
          errorDetails.includes('payment_setup_completed')
        ) {
          toast({ 
            title: "Payment setup required", 
            description: "Complete your payment setup to publish products.",
            variant: "destructive"
          });
          navigate("/vendor/payment-setup");
          return;
        }
        
        toast({ 
          title: "Access Denied", 
          description: "You don't have permission to perform this action. Contact support if this persists.", 
          variant: "destructive" 
        });
        return;
      }
      
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const result = await ServiceFactory.getProductService().update(id, updates);
      if (!result.success) throw result.error;
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-products', vendorId] });
      toast({ title: "Product updated" });
      closeDialog();
    },
    onError: (e: any) => {
      if (e.status === 403 || e.code === '42501' || e.message?.includes('RLS')) {
        const errorMessage = e.message?.toLowerCase() || '';
        const errorDetails = e.details?.toLowerCase() || '';
        
        if (
          errorMessage.includes('payment') || 
          errorDetails.includes('payment_setup_completed')
        ) {
          toast({ 
            title: "Payment setup required", 
            description: "Complete your payment setup to publish products.",
            variant: "destructive"
          });
          navigate("/vendor/payment-setup");
          return;
        }
        
        toast({ 
          title: "Access Denied", 
          description: "You don't have permission to perform this action. Contact support if this persists.", 
          variant: "destructive" 
        });
        return;
      }
      
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await ServiceFactory.getProductService().remove(id);
      if (!result.success) throw result.error;
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-products', vendorId] });
      toast({ title: "Product deleted" });
    },
  });

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
    setForm({ title: "", description: "", price: "", discountPrice: "", stock: "", lowStockThreshold: "5", category: DEFAULT_CATEGORY, status: "active", allowCod: true });
    setImageUrls([]);
  };

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({
      title: p.title,
      description: p.description || "",
      price: String(p.price),
      discountPrice: p.discountPrice ? String(p.discountPrice) : "",
      stock: String(p.stock),
      lowStockThreshold: String(p.lowStockThreshold ?? 5),
      category: p.category,
      status: p.status || "active",
      allowCod: p.allowCod ?? true,
    });
    setImageUrls(p.images || []);
    setOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !user) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const result = await ServiceFactory.getProductService().uploadImage(file, user.id);
        if (!result.success) throw new Error(result.error.message);
        urls.push(result.data);
      }
      setImageUrls(prev => [...prev, ...urls]);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (idx: number) => setImageUrls(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        updates: {
          title: form.title,
          description: form.description,
          price: parseFloat(form.price),
          discount_price: form.discountPrice ? parseFloat(form.discountPrice) : null,
          stock: parseInt(form.stock),
          low_stock_threshold: parseInt(form.lowStockThreshold) || 5,
          category: form.category,
          images: imageUrls,
          status: form.status,
          allow_cod: form.allowCod,
        },
      });
    } else {
      createMutation.mutate({
        vendor_id: vendorId,
        title: form.title,
        slug: slug + "-" + Date.now(),
        description: form.description,
        price: parseFloat(form.price),
        discount_price: form.discountPrice ? parseFloat(form.discountPrice) : null,
        stock: parseInt(form.stock),
        low_stock_threshold: parseInt(form.lowStockThreshold) || 5,
        category: form.category,
        images: imageUrls,
        status: form.status,
        allow_cod: form.allowCod,
      });
    }
  };

  const toggleStatus = (p: any, newStatus: string) => {
    updateMutation.mutate({ id: p.id, updates: { status: newStatus } });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-muted-foreground">Manage your product inventory</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else if (!paymentSetupCompleted) { toast({ title: "Payment Setup Required", description: "Complete your payment setup before adding products.", variant: "destructive" }); navigate("/vendor/payment-setup"); } else setOpen(true); }}>
          <DialogTrigger asChild>
            <button
              disabled={!paymentSetupCompleted || isLoadingPaymentStatus}
              title={!paymentSetupCompleted ? "Complete your payment setup first" : undefined}
              className={`px-4 py-2 rounded font-semibold flex items-center ${
                paymentSetupCompleted && !isLoadingPaymentStatus
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {isLoadingPaymentStatus ? "Loading..." : <><Plus className="h-4 w-4 mr-2" /> Create Product</>}
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Product" : "New Product"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price ($)</Label>
                  <Input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Discount Price ($)</Label>
                  <Input type="number" step="0.01" value={form.discountPrice} onChange={e => setForm(f => ({ ...f, discountPrice: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Stock</Label>
                  <Input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Low Stock Alert</Label>
                  <Input type="number" value={form.lowStockThreshold} onChange={e => setForm(f => ({ ...f, lowStockThreshold: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                    <Banknote className="h-4 w-4" />
                  </div>
                  <div>
                    <Label htmlFor="allow-cod" className="text-sm font-semibold cursor-pointer">Allow Cash on Delivery (COD)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Customers can pay when the order arrives. Turn off to require online payment.</p>
                  </div>
                </div>
                <Switch
                  id="allow-cod"
                  checked={form.allowCod}
                  onCheckedChange={(v) => setForm(f => ({ ...f, allowCod: v }))}
                />
              </div>


              {/* Image upload */}
              <div className="space-y-2">
                <Label>Images</Label>
                <div className="flex flex-wrap gap-2">
                  {imageUrls.map((url, i) => (
                    <div key={i} className="relative h-20 w-20 rounded-lg overflow-hidden border group">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="h-20 w-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    {uploading ? <span className="text-xs">...</span> : <><Upload className="h-5 w-5" /><span className="text-[10px] mt-1">Upload</span></>}
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
              </div>

              <Button type="submit" className="w-full" disabled={isSaving}>
                {isSaving ? "Saving..." : editing ? "Update" : "Create"} Product
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {paymentStatusError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded mb-6">
          <p className="text-red-800">{paymentStatusError}</p>
          <button onClick={() => window.location.reload()} className="mt-2 text-red-600 underline">
            Refresh page
          </button>
        </div>
      )}

      {isLoadingPaymentStatus && (
        <div className="mb-6 h-12 w-full bg-muted animate-pulse rounded"></div>
      )}

      {!isLoadingPaymentStatus && !paymentStatusError && !paymentSetupCompleted && (
        <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-800">Payment Setup Incomplete</h3>
              <p className="text-yellow-700 text-sm mt-1">
                You must complete your payment setup before you can publish products.
              </p>
              <button
                onClick={() => navigate("/vendor/payment-setup")}
                className="mt-2 px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
              >
                Complete Payment Setup
              </button>
            </div>
          </div>
        </div>
      )}

      {!isLoadingPaymentStatus && !paymentStatusError && paymentSetupCompleted && (
        <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-400 rounded">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-green-800 font-semibold">✓ Payment Setup Complete</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="marketplace-shadow animate-pulse">
              <CardContent className="py-4"><div className="h-16" /></CardContent>
            </Card>
          ))}
        </div>
      ) : products.length === 0 ? (
        <Card className="marketplace-shadow">
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">No products yet</h3>
            <p className="text-muted-foreground text-sm mt-1">Add your first product to start selling.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {products.map(p => {
            const statusOpt = statusOptions.find(s => s.value === (p.status || 'active'));
            return (
              <Card key={p.id} className="marketplace-shadow">
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {p.images?.[0] ? (
                      <img src={p.images[0]} alt={p.title} className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{p.title}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      <span>{formatPrice(Number(p.price))}</span>
                      {(() => {
                        const avail = p.stock - (p.reservedStock ?? 0);
                        const isLow = avail > 0 && avail <= (p.lowStockThreshold ?? 5);
                        const isOut = avail <= 0;
                        return (
                          <>
                            <span>Stock: {p.stock}</span>
                            {(p.reservedStock ?? 0) > 0 && <span className="text-primary">Reserved: {p.reservedStock}</span>}
                            <span className={isOut ? 'text-destructive font-medium' : isLow ? 'text-destructive/70 font-medium' : ''}>
                              Avail: {avail}
                            </span>
                          </>
                        );
                      })()}
                      <Badge variant="secondary" className="text-xs">{formatCategoryLabel(p.category)}</Badge>
                      <Badge variant={statusOpt?.variant || "secondary"} className="text-xs">{statusOpt?.label || p.status}</Badge>
                      {(() => {
                        const avail = p.stock - (p.reservedStock ?? 0);
                        if (avail <= 0) return <Badge variant="destructive" className="text-xs">Out of Stock</Badge>;
                        if (avail <= (p.lowStockThreshold ?? 5)) return <Badge variant="outline" className="text-xs border-destructive/50 text-destructive"><AlertTriangle className="h-3 w-3 mr-1" />Low Stock</Badge>;
                        return null;
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Select value={p.status || 'active'} onValueChange={(v) => toggleStatus(p, v)}>
                      <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" aria-label={`Edit ${p.title}`} onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${p.title}`} onClick={() => deleteMutation.mutate(p.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
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

export default VendorProducts;
