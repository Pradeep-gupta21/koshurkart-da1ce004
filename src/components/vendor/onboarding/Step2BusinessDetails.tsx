import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import OnboardingFieldGroup from "./OnboardingFieldGroup";
import { Briefcase, Tag } from "lucide-react";
import {
  STORE_CATEGORIES,
  step2Schema,
  slugify,
  type Step2,
} from "@/lib/validators/vendorOnboardingSchema";
import { BUSINESS_TYPES } from "@/lib/validators/kycSchema";

interface Props {
  initial: Partial<Step2>;
  onChange: (data: Partial<Step2>, valid: boolean) => void;
  errors?: Partial<Record<keyof Step2, string>>;
}

const Step2BusinessDetails = ({ initial, onChange, errors }: Props) => {
  const [storeName, setStoreName] = useState(initial.store_name ?? "");
  const [storeSlug, setStoreSlug] = useState(initial.store_slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!initial.store_slug);
  const [businessType, setBusinessType] = useState<string>(initial.business_type ?? "individual");
  const [category, setCategory] = useState<string>(initial.category ?? "");
  const [description, setDescription] = useState(initial.description ?? "");

  // Auto-derive slug from store name unless user has touched it
  useEffect(() => {
    if (!slugTouched) setStoreSlug(slugify(storeName));
  }, [storeName, slugTouched]);

  useEffect(() => {
    const data: Partial<Step2> = {
      store_name: storeName,
      store_slug: storeSlug,
      business_type: businessType as any,
      category: category as any,
      description,
    };
    const parsed = step2Schema.safeParse(data);
    onChange(data, parsed.success);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeName, storeSlug, businessType, category, description]);

  return (
    <div className="space-y-5">
      <OnboardingFieldGroup
        title="Business details"
        description="How customers will find and recognise your store."
        icon={Briefcase}
      >
        <div className="space-y-2">
          <Label htmlFor="store_name">Store Name</Label>
          <Input
            id="store_name"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="My Awesome Store"
          />
          {errors?.store_name && <p className="text-xs text-destructive">{errors.store_name}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="store_slug">Store URL</Label>
          <div className="flex items-center rounded-md border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
            <span className="px-3 text-xs text-muted-foreground bg-muted/50 border-r h-10 flex items-center">
              /store/
            </span>
            <input
              id="store_slug"
              value={storeSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              }}
              className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
              placeholder="my-store"
            />
          </div>
          {errors?.store_slug && <p className="text-xs text-destructive">{errors.store_slug}</p>}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Business Type</Label>
            <Select value={businessType} onValueChange={setBusinessType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace("-", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Primary Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {STORE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors?.category && <p className="text-xs text-destructive">{errors.category}</p>}
          </div>
        </div>
      </OnboardingFieldGroup>

      <OnboardingFieldGroup title="Describe your store" icon={Tag}>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Tell customers what makes your store unique…"
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground text-right">{description.length}/1000</p>
        </div>
      </OnboardingFieldGroup>
    </div>
  );
};

export default Step2BusinessDetails;
