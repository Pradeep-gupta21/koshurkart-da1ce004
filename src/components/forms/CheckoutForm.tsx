import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { sanitizeFormValues } from "@/lib/sanitize";

export interface CheckoutFormValues {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  zipCode: string;
  cardNumber: string;
  expiry: string;
  cvc: string;
}

interface CheckoutFormProps {
  onSubmit: (values: CheckoutFormValues) => void;
  submitLabel?: string;
}

const CheckoutForm = ({ onSubmit, submitLabel = "Place Order" }: CheckoutFormProps) => {
  const [form, setForm] = useState<CheckoutFormValues>({
    firstName: "", lastName: "", address: "", city: "", zipCode: "", cardNumber: "", expiry: "", cvc: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sanitized = sanitizeFormValues(form as unknown as Record<string, unknown>) as unknown as CheckoutFormValues;
    onSubmit(sanitized);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-card rounded-xl marketplace-shadow p-6">
        <h2 className="font-semibold mb-4">Shipping Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>First Name</Label>
            <Input placeholder="John" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label>Last Name</Label>
            <Input placeholder="Doe" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Address</Label>
            <Input placeholder="123 Main Street" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input placeholder="New York" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label>Zip Code</Label>
            <Input placeholder="10001" value={form.zipCode} onChange={e => setForm(f => ({ ...f, zipCode: e.target.value }))} required />
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl marketplace-shadow p-6">
        <h2 className="font-semibold mb-4">Payment Method</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label>Card Number</Label>
            <Input placeholder="4242 4242 4242 4242" value={form.cardNumber} onChange={e => setForm(f => ({ ...f, cardNumber: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label>Expiry</Label>
            <Input placeholder="MM/YY" value={form.expiry} onChange={e => setForm(f => ({ ...f, expiry: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label>CVC</Label>
            <Input placeholder="123" value={form.cvc} onChange={e => setForm(f => ({ ...f, cvc: e.target.value }))} required />
          </div>
        </div>
      </div>
    </form>
  );
};

export default CheckoutForm;
