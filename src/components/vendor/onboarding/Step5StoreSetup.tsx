import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import OnboardingFieldGroup from "./OnboardingFieldGroup";
import FileDropzone from "./FileDropzone";
import { Image as ImageIcon, Sparkles } from "lucide-react";
import { vendorService } from "@/services/vendorService";
import { step5Schema, type Step5 } from "@/lib/validators/vendorOnboardingSchema";

interface Props {
  vendorId: string | null;
  initial: Partial<Step5>;
  onChange: (data: Partial<Step5>, valid: boolean) => void;
}

const Step5StoreSetup = ({ vendorId, initial, onChange }: Props) => {
  const [logo, setLogo] = useState(initial.logo_url ?? "");
  const [banner, setBanner] = useState(initial.banner_url ?? "");
  const [tagline, setTagline] = useState(initial.tagline ?? "");

  useEffect(() => {
    const data: Partial<Step5> = { logo_url: logo, banner_url: banner, tagline };
    const parsed = step5Schema.safeParse(data);
    onChange(data, parsed.success);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logo, banner, tagline]);

  return (
    <div className="space-y-5">
      <OnboardingFieldGroup
        title="Brand your storefront"
        description="Make a great first impression. You can change these anytime."
        icon={ImageIcon}
      >
        {!vendorId && (
          <p className="text-xs text-muted-foreground">
            We'll create your store record now so you can upload your logo and banner.
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <FileDropzone
            label="Store Logo"
            hint="Square image, ~512×512"
            accept="image/*"
            previewUrl={logo}
            uploadedPath={logo}
            onUpload={async (f) => {
              if (!vendorId) throw new Error("Vendor record not created yet");
              const url = await vendorService.uploadLogo(vendorId, f);
              setLogo(url);
            }}
            onRemove={() => setLogo("")}
            aspect="square"
          />
          <FileDropzone
            label="Store Banner"
            hint="Wide image, ~1500×500"
            accept="image/*"
            previewUrl={banner}
            uploadedPath={banner}
            onUpload={async (f) => {
              if (!vendorId) throw new Error("Vendor record not created yet");
              const url = await vendorService.uploadBanner(vendorId, f);
              setBanner(url);
            }}
            onRemove={() => setBanner("")}
            aspect="wide"
          />
        </div>
      </OnboardingFieldGroup>

      <OnboardingFieldGroup title="Store tagline" icon={Sparkles}>
        <div className="space-y-2">
          <Label htmlFor="tagline">Tagline (optional)</Label>
          <Input
            id="tagline"
            value={tagline}
            maxLength={80}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Handcrafted Kashmir, delivered with love"
          />
          <p className="text-xs text-muted-foreground text-right">{tagline?.length ?? 0}/80</p>
        </div>
      </OnboardingFieldGroup>
    </div>
  );
};

export default Step5StoreSetup;
