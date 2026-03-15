import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";

const categories = ["Electronics", "Fashion", "Home & Living", "Sports", "Beauty", "Books"];

const VendorProducts = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const [products, setProducts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ title: "", description: "", price: "", discountPrice: "", stock: "", category: "Electronics", images: "" });
  const { toast } = useToast();

  const fetchProducts = async () => {
    const { data } = await supabase.from("products").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false });
    setProducts(data ?? []);
  };

  useEffect(() => { if (vendorId) fetchProducts(); }, [vendorId]);

  const resetForm = () => {
    setForm({ title: "", description: "", price: "", discountPrice: "", stock: "", category: "Electronics", images: "" });
    setEditing(null);
  };

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({
      title: p.title,
      description: p.description || "",
      price: String(p.price),
      discountPrice: p.discount_price ? String(p.discount_price) : "",
      stock: String(p.stock),
      category: p.category,
      images: (p.images || []).join(", "),
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const payload = {
      vendor_id: vendorId,
      title: form.title,
      slug: editing ? editing.slug : slug + "-" + Date.now(),
      description: form.description,
      price: parseFloat(form.price),
      discount_price: form.discountPrice ? parseFloat(form.discountPrice) : null,
      stock: parseInt(form.stock),
      category: form.category,
      images: form.images.split(",").map(s => s.trim()).filter(Boolean),
    };

    if (editing) {
      const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Product updated" });
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Product created" });
    }
    setOpen(false);
    resetForm();
    fetchProducts();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("products").delete().eq("id", id);
    toast({ title: "Product deleted" });
    fetchProducts();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-muted-foreground">Manage your product inventory</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add Product</Button>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stock</Label>
                  <Input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <select className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                    value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Image URLs (comma-separated)</Label>
                <Input value={form.images} onChange={e => setForm(f => ({ ...f, images: e.target.value }))} placeholder="https://..." />
              </div>
              <Button type="submit" className="w-full">{editing ? "Update" : "Create"} Product</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {products.length === 0 ? (
        <Card className="marketplace-shadow">
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">No products yet</h3>
            <p className="text-muted-foreground text-sm mt-1">Add your first product to start selling.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {products.map(p => (
            <Card key={p.id} className="marketplace-shadow">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {p.images?.[0] ? (
                    <img src={p.images[0]} alt={p.title} className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{p.title}</h3>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                    <span>${p.price}</span>
                    <span>Stock: {p.stock}</span>
                    <span className="px-2 py-0.5 bg-muted rounded text-xs">{p.category}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default VendorProducts;
