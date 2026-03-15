import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export interface CampaignFormValues {
  productId: string;
  placement: string;
  budget: string;
  dailyLimit: string;
  startDate: string;
  endDate: string;
}

interface CampaignFormProps {
  products: { id: string; title: string }[];
  onSubmit: (values: CampaignFormValues) => void;
}

const CampaignForm = ({ products, onSubmit }: CampaignFormProps) => {
  const [form, setForm] = useState<CampaignFormValues>({
    productId: "", placement: "search", budget: "", dailyLimit: "", startDate: "", endDate: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Product</Label>
        <select className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))} required>
          <option value="">Select a product</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label>Placement</Label>
        <select className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          value={form.placement} onChange={e => setForm(f => ({ ...f, placement: e.target.value }))}>
          <option value="homepage">Homepage</option>
          <option value="search">Search Results</option>
          <option value="product">Product Page</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Budget ($)</Label>
          <Input type="number" step="0.01" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} required />
        </div>
        <div className="space-y-2">
          <Label>Daily Limit ($)</Label>
          <Input type="number" step="0.01" value={form.dailyLimit} onChange={e => setForm(f => ({ ...f, dailyLimit: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Start Date</Label>
          <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required />
        </div>
        <div className="space-y-2">
          <Label>End Date</Label>
          <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
        </div>
      </div>
      <Button type="submit" className="w-full">Submit Campaign</Button>
    </form>
  );
};

export default CampaignForm;
