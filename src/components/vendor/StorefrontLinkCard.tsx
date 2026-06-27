import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Share2, Copy, Check, Store, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

interface Props {
  storeSlug?: string | null;
  storeName?: string | null;
}

/**
 * Compact "Your Storefront Link" card displayed on the Vendor Overview.
 * Renders the public store URL and a one-click copy/share affordance.
 */
const StorefrontLinkCard = ({ storeSlug, storeName }: Props) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://koshurkart.shop";
  const path = storeSlug ? `/store/${storeSlug}` : "";
  const fullUrl = storeSlug ? `${origin}${path}` : "";
  // Pretty display variant: koshurkart.shop/store/handle
  const displayUrl = storeSlug
    ? `${origin.replace(/^https?:\/\//, "")}${path}`
    : "Set your store URL in onboarding to enable sharing.";

  const handleCopy = async () => {
    if (!fullUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullUrl);
      } else {
        const ta = document.createElement("textarea");
        ta.value = fullUrl;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast({ title: "Copied!", description: "Storefront link copied to clipboard." });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Copy failed", description: "Please copy the link manually.", variant: "destructive" });
    }
  };

  const handleNativeShare = async () => {
    if (!fullUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: storeName ? `${storeName} on Koshur Kart` : "My Koshur Kart storefront",
          text: storeName ? `Shop ${storeName} on Koshur Kart` : "Shop my store on Koshur Kart",
          url: fullUrl,
        });
        return;
      } catch {
        /* user dismissed — fall through to copy */
      }
    }
    handleCopy();
  };

  return (
    <Card className="marketplace-shadow border-primary/30 bg-gradient-to-br from-secondary/10 via-card to-card relative overflow-hidden h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Store className="h-5 w-5 text-primary" />
          Your Storefront Link
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Share this link anywhere — customers land directly on your store.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm font-mono break-all select-all"
          aria-label="Storefront URL"
        >
          {displayUrl}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            onClick={handleCopy}
            disabled={!storeSlug}
            className="flex-1 gap-2"
            size="sm"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy Link
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleNativeShare}
            disabled={!storeSlug}
            className="gap-2"
            aria-label="Share storefront link"
          >
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </div>

        {storeSlug && (
          <Button asChild variant="ghost" size="sm" className="w-full gap-2 text-xs">
            <Link to={path} target="_blank" rel="noopener">
              <ExternalLink className="h-3.5 w-3.5" />
              Preview your storefront
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default StorefrontLinkCard;
