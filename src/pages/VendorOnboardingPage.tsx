import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { vendorService } from "@/services/vendorService";
import { useOnboardingDraft } from "@/hooks/useOnboardingDraft";
import OnboardingShell from "@/components/vendor/onboarding/OnboardingShell";
import Step1BasicInfo from "@/components/vendor/onboarding/Step1BasicInfo";
import Step2BusinessDetails from "@/components/vendor/onboarding/Step2BusinessDetails";
import Step3Address from "@/components/vendor/onboarding/Step3Address";
import Step4KYC from "@/components/vendor/onboarding/Step4KYC";
import Step5StoreSetup from "@/components/vendor/onboarding/Step5StoreSetup";
import Step6Review from "@/components/vendor/onboarding/Step6Review";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
} from "@/lib/validators/vendorOnboardingSchema";
import { maskAccountNumber } from "@/lib/validators/kycSchema";
import { Loader2 } from "lucide-react";

const STEPS = [
  { id: 1, label: "Basic Info" },
  { id: 2, label: "Business" },
  { id: 3, label: "Address" },
  { id: 4, label: "KYC" },
  { id: 5, label: "Storefront" },
  { id: 6, label: "Review" },
];

const VendorOnboardingPage = () => {
  const { user, loading, vendorId, vendorStatus, refreshVendor } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const draft = useOnboardingDraft();

  const [profileName, setProfileName] = useState("");
  const [stepValid, setStepValid] = useState<Record<number, boolean>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [highest, setHighest] = useState(1);

  // Pre-fill name from profiles
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.name) setProfileName(data.name);
      });
  }, [user]);

  useEffect(() => {
    setHighest((h) => Math.max(h, draft.currentStep));
  }, [draft.currentStep]);

  // If already a verified vendor, check payment setup status and redirect
  useEffect(() => {
    if (vendorStatus !== "verified" && vendorStatus !== "approved") return;
    if (!vendorId) {
      navigate("/vendor", { replace: true });
      return;
    }

    let cancelled = false;

    const checkPaymentSetup = async () => {
      try {
        const { data, error } = await supabase
          .from("vendors")
          .select("payment_setup_completed")
          .eq("id", vendorId)
          .single();

        if (cancelled) return; // Cleanup guard: don't navigate if component unmounted

        if (error) {
          console.error("Failed to fetch payment setup status:", error);
          // Fail open: redirect to dashboard, vendor can complete setup manually
          navigate("/vendor", { replace: true });
          return;
        }

        const done = data?.payment_setup_completed ?? false;
        navigate(
          done ? "/vendor" : "/vendor/payment-setup?fromOnboarding=true",
          { replace: true }
        );
      } catch (e) {
        if (!cancelled) {
          console.error("Unexpected error checking payment setup:", e);
          navigate("/vendor", { replace: true }); // Fail open
        }
      }
    };

    checkPaymentSetup();

    return () => {
      cancelled = true; // Cleanup: prevent stale callbacks after unmount
    };
  }, [vendorStatus, vendorId, navigate]);

  const setValid = (step: number, ok: boolean) =>
    setStepValid((p) => (p[step] === ok ? p : { ...p, [step]: ok }));

  const updateStep = (key: keyof typeof draft.data, payload: any) => {
    draft.updateStep(key, payload);
  };

  const goNext = async () => {
    const step = draft.currentStep;
    if (step < 6) {
      // Ensure vendor row exists before step 4 (KYC uploads need user_id folder = vendor row's user)
      if (step === 3 && !vendorId) {
        try {
          const s2 = draft.data.step2 ?? {};
          if (!s2.store_name || !s2.store_slug) {
            toast({ title: "Missing business details", variant: "destructive" });
            draft.goTo(2);
            return;
          }
          await supabase.rpc("vendor_apply", {
            _store_name: s2.store_name,
            _store_slug: s2.store_slug,
            _description: s2.description ?? "",
          });
          await refreshVendor();
        } catch (e: any) {
          if (!/already a vendor/i.test(e?.message ?? "")) {
            toast({ title: "Could not create vendor record", description: e.message, variant: "destructive" });
            return;
          }
          await refreshVendor();
        }
      }
      const next = step + 1;
      draft.goTo(next);
      setHighest((h) => Math.max(h, next));
    } else {
      await handleSubmit();
    }
  };

  const goBack = () => {
    if (draft.currentStep > 1) draft.goTo(draft.currentStep - 1);
  };

  const onExit = async () => {
    await draft.flush();
    toast({ title: "Progress saved", description: "Resume anytime from /vendor/apply" });
    navigate("/");
  };

  const handleSubmit = async () => {
    if (!vendorId) {
      toast({ title: "Vendor record missing", variant: "destructive" });
      return;
    }
    const s1 = draft.data.step1 ?? {};
    const s2 = draft.data.step2 ?? {};
    const s3 = draft.data.step3 ?? {};
    const s4 = (draft.data.step4 ?? {}) as any;
    const s5 = draft.data.step5 ?? {};
    setSubmitting(true);
    try {
      const acctMasked = s4.bank_account_number
        ? maskAccountNumber(s4.bank_account_number)
        : s4.bank_account_number_masked;

      const { error } = await supabase
        .from("vendors")
        .update({
          store_name: s2.store_name!,
          store_slug: s2.store_slug!,
          description: s2.description ?? "",
          category: s2.category ?? null,
          business_type: s2.business_type ?? null,
          tagline: s5.tagline ?? null,
          logo: s5.logo_url ?? null,
          banner: s5.banner_url ?? null,
          phone: s1.phone ?? null,
          phone_verified_at: s1.phone_verified ? new Date().toISOString() : null,
          pickup_address_line1: s3.pickup_address_line1 ?? null,
          pickup_address_line2: s3.pickup_address_line2 ?? null,
          pickup_city: s3.pickup_city ?? null,
          pickup_state: s3.pickup_state ?? null,
          pickup_pincode: s3.pickup_pincode ?? null,
          pickup_country: s3.pickup_country ?? "IN",
          business_name: s4.business_name ?? null,
          pan_number: s4.pan_number ?? null,
          gstin: s4.gstin || null,
          aadhaar_last4: s4.aadhaar_last4 ?? null,
          bank_account_holder: s4.bank_account_holder ?? null,
          bank_account_number_masked: acctMasked ?? null,
          bank_ifsc: s4.bank_ifsc ?? null,
          kyc_doc_pan: s4.doc_pan_path ?? null,
          kyc_doc_address: s4.doc_address_path ?? null,
          kyc_doc_business: s4.doc_business_path || null,
          kyc_status: "pending",
          kyc_submitted_at: new Date().toISOString(),
          kyc_rejection_reason: null,
        })
        .eq("id", vendorId);
      if (error) throw error;

      await draft.clearDraft();
      await refreshVendor();
      supabase.functions
        .invoke("send-transactional-email", { body: { type: "vendor_kyc_welcome" } })
        .catch((e) => console.warn("vendor welcome email failed", e));
      toast({ title: "Application submitted", description: "We'll review and get back to you shortly." });
      navigate("/vendor", { replace: true });
    } catch (e: any) {
      toast({ title: "Submission failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // Per-step validity using zod parses against current draft (so resuming sets buttons correctly)
  const isStepValid = useMemo(() => {
    return (step: number) => {
      if (stepValid[step] !== undefined) return stepValid[step];
      const d: any = draft.data;
      if (step === 1) return step1Schema.safeParse({ ...d.step1, email: user?.email ?? "" }).success && !!d.step1?.phone_verified;
      if (step === 2) return step2Schema.safeParse(d.step2).success;
      if (step === 3) return step3Schema.safeParse(d.step3).success;
      if (step === 4) return step4Schema.safeParse(d.step4).success;
      if (step === 5) return step5Schema.safeParse(d.step5 ?? {}).success;
      if (step === 6) return confirmed;
      return false;
    };
  }, [stepValid, draft.data, user, confirmed]);

  if (loading || !draft.hydrated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) {
    navigate("/auth", { replace: true });
    return null;
  }

  const current = draft.currentStep;
  const nextLabel = current === 6 ? "Submit Application" : "Continue";
  const nextDisabled = !isStepValid(current);

  return (
    <OnboardingShell
      steps={STEPS}
      current={current}
      highest={highest}
      onJump={(s) => s <= highest && draft.goTo(s)}
      onBack={current > 1 ? goBack : undefined}
      onNext={goNext}
      onExit={onExit}
      nextLabel={nextLabel}
      nextDisabled={nextDisabled}
      isSubmitting={submitting}
      saveState={draft.saveState}
      savedAt={draft.savedAt}
    >
      {current === 1 && (
        <Step1BasicInfo
          initial={draft.data.step1 ?? {}}
          email={user.email ?? ""}
          defaultName={profileName}
          onChange={(d, ok) => {
            updateStep("step1", d);
            setValid(1, ok);
          }}
        />
      )}
      {current === 2 && (
        <Step2BusinessDetails
          initial={draft.data.step2 ?? {}}
          onChange={(d, ok) => {
            updateStep("step2", d);
            setValid(2, ok);
          }}
        />
      )}
      {current === 3 && (
        <Step3Address
          initial={draft.data.step3 ?? {}}
          onChange={(d, ok) => {
            updateStep("step3", d);
            setValid(3, ok);
          }}
        />
      )}
      {current === 4 && (
        <Step4KYC
          initial={(draft.data.step4 ?? {}) as any}
          onChange={(d, ok) => {
            // Strip raw account number — keep only masked
            const { bank_account_number, ...rest } = d as any;
            updateStep("step4", {
              ...rest,
              bank_account_number_masked: bank_account_number
                ? maskAccountNumber(bank_account_number)
                : (draft.data.step4 as any)?.bank_account_number_masked,
            });
            setValid(4, ok);
          }}
        />
      )}
      {current === 5 && (
        <Step5StoreSetup
          vendorId={vendorId}
          initial={draft.data.step5 ?? {}}
          onChange={(d, ok) => {
            updateStep("step5", d);
            setValid(5, ok);
          }}
        />
      )}
      {current === 6 && (
        <Step6Review
          draft={draft.data}
          email={user.email ?? ""}
          confirmed={confirmed}
          onConfirm={setConfirmed}
          onJump={(s) => draft.goTo(s)}
        />
      )}
    </OnboardingShell>
  );
};

export default VendorOnboardingPage;
