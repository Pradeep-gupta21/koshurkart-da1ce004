import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { sanitizeText } from "@/lib/sanitize";
import { MARKETPLACE_CATEGORIES } from "@/config/categories";

const categories = MARKETPLACE_CATEGORIES;

export interface ProductFormValues {
  title: string;
  description: string;
  price: string;
  discountPrice: string;
  stock: string;
  category: string;
  images: string;
}

interface ProductFormProps {
  initialValues?: Partial<ProductFormValues>;
  isEditing?: boolean;
  onSubmit: (values: ProductFormValues) => void;
}

const defaultValues: ProductFormValues = {
  title: "", description: "", price: "", discountPrice: "", stock: "", category: categories[0].slug, images: "",
};

const ProductForm = ({ initialValues, isEditing = false, onSubmit }: ProductFormProps) => {
  const [form, setForm] = useState<ProductFormValues>({ ...defaultValues, ...initialValues });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...form,
      title: sanitizeText(form.title),
      description: sanitizeText(form.description),
    });
  };

  return (
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
      <Button type="submit" className="w-full">{isEditing ? "Update" : "Create"} Product</Button>
    </form>
  );
};

export default ProductForm;
