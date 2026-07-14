import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Banknote, Smartphone, CheckCircle2, ArrowRight, ArrowLeft,
  Loader2, ShieldCheck, AlertCircle, RefreshCw,
} from "lucide-react";

/* ─────────────────── Validation ──────────────────────────────────── */

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{9,18}$/;
const UPI_RE = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;

interface FormData {
  useIfsc: boolean;
  useUpi: boolean;
  ifscCode: string;
  accountNumber: string;
  accountHolderName: string;
  upiId: string;
}

interface FieldErrors {
  ifscCode?: string;
  accountNumber?: string;
  accountHolderName?: string;
  upiId?: string;
  general?: string;
}

function validate(form: FormData): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.useIfsc && !form.useUpi) {
    errors.general = "Select at least one payment method.";
    return errors;
  }
  if (form.useIfsc) {
    if (!form.ifscCode.trim()) errors.ifscCode = "IFSC code is required.";
    else if (!IFSC_RE.test(form.ifscCode.trim().toUpperCase()))
      errors.ifscCode = "Invalid IFSC. Format: 4 letters + 0 + 6 chars (e.g. HDFC0001234).";
    if (!form.accountNumber.trim()) errors.accountNumber = "Account number is required.";
    else if (!ACCOUNT_RE.test(form.accountNumber.trim()))
      errors.accountNumber = "Account number must be 9–18 digits.";
    if (!form.accountHolderName.trim()) errors.accountHolderName = "Account holder name is required.";
  }
  if (form.useUpi) {
    if (!form.upiId.trim()) errors.upiId = "UPI ID is required.";
    else if (!UPI_RE.test(form.upiId.trim()))
      errors.upiId = "Invalid UPI format. Expected: username@bankname.";
  }
  return errors;
}

/* ─────────────────── Helpers ─────────────────────────────────────── */

function maskAccount(acc: string | null): string {
  if (!acc || acc.length < 4) return "****";
  return "****" + acc.slice(-4);
}

function maskUpi(upi: string | null): string {
  if (!upi) return "***@****";
  const parts = upi.split("@");
  if (parts.length < 2) return "***@****";
  const user = parts[0].length > 3 ? parts[0].slice(0, 3) + "***" : "***";
  return `${user}@${parts[1]}`;
}

/* ─────────────────── Component ───────────────────────────────────── */

const VendorPaymentSetup = () => {
  const { user, vendorId, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // #1: Check if navigated from onboarding
  const fromOnboarding = searchParams.get("fromOnboarding") === "true";

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverErrors, setServerErrors] = useState<string | null>(null);
  const [isEdit, setIsEdit] = useState(false);

  // #2: Fetch error state
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Prevent double-redirect with ref
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [form, setForm] = useState<FormData>({
    useIfsc: false,
    useUpi: false,
    ifscCode: "",
    accountNumber: "",
    accountHolderName: "",
    upiId: "",
  });

  const update = (key: keyof FormData, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  /* ── Fetch existing setup ──────────────────────────────────────── */
  const fetchSetup = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase.functions.invoke("vendor-setup-payment", {
        method: "GET",
      });

      // #4: Parse FunctionsHttpError before throwing
      if (error) {
        // Supabase FunctionsHttpError may have a response body
        let msg = error.message || "Failed to load payment setup.";
        try {
          if ("context" in error && (error as any).context?.body) {
            const body = JSON.parse(new TextDecoder().decode((error as any).context.body));
            if (body?.error) msg = body.error;
          }
        } catch {
          // parsing failed, use original message
        }
        throw new Error(msg);
      }

      if (data?.paymentSetup) {
        const ps = data.paymentSetup;
        setIsEdit(true);
        setForm({
          useIfsc: ps.paymentDestinationType === "ifsc_account" || ps.paymentDestinationType === "both",
          useUpi: ps.paymentDestinationType === "upi_id" || ps.paymentDestinationType === "both",
          ifscCode: ps.ifscCode ?? "",
          accountNumber: ps.accountNumber ?? "",
          accountHolderName: ps.accountHolderName ?? "",
          upiId: ps.upiId ?? "",
        });
        // #5: Don't lock the form when is_completed — always allow editing
        if (ps.isCompleted) setSuccess(true);
      } else if (data?.vendorStatus?.defaultAccountHolder) {
        setForm((f) => ({ ...f, accountHolderName: data.vendorStatus.defaultAccountHolder }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load payment setup.";
      console.error("Failed to fetch payment setup:", err);
      // #2: Set error state instead of silently swallowing
      setFetchError(msg);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading && user) fetchSetup();
  }, [authLoading, user, fetchSetup]);

  // Cleanup redirect timer on unmount
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  /* ── Proceed to review ─────────────────────────────────────────── */
  const goToReview = () => {
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      setStep(2);
      setConfirmed(false);
    }
  };

  /* ── Submit ────────────────────────────────────────────────────── */
  const handleSubmit = async () => {
    setSubmitting(true);
    setServerErrors(null);
    try {
      // #5: Use PUT if editing existing setup, POST if new
      const method = isEdit ? "PUT" : "POST";

      const { data, error } = await supabase.functions.invoke("vendor-setup-payment", {
        method,
        body: {
          ifscCode: form.useIfsc ? form.ifscCode.trim().toUpperCase() : undefined,
          accountNumber: form.useIfsc ? form.accountNumber.trim() : undefined,
          accountHolderName: form.useIfsc ? form.accountHolderName.trim() : undefined,
          upiId: form.useUpi ? form.upiId.trim() : undefined,
        },
      });

      // #4: Parse FunctionsHttpError response body
      if (error) {
        let msg = error.message || "Failed to save payment setup.";
        let parsedFieldErrors: FieldErrors | null = null;
        try {
          if ("context" in error && (error as any).context?.body) {
            const body = JSON.parse(new TextDecoder().decode((error as any).context.body));
            if (body?.error) msg = body.error;
            if (body?.fieldErrors) parsedFieldErrors = body.fieldErrors;
            if (body?.errors && Array.isArray(body.errors)) {
              const fe: FieldErrors = {};
              for (const e of body.errors) {
                (fe as any)[e.field] = e.message;
              }
              parsedFieldErrors = fe;
            }
          }
        } catch {
          // parsing failed
        }
        if (parsedFieldErrors && Object.keys(parsedFieldErrors).length > 0) {
          setErrors(parsedFieldErrors);
          setStep(1);
        }
        throw new Error(msg);
      }

      // Handle application-level errors in response body
      if (data?.error) {
        if (data.errors && Array.isArray(data.errors)) {
          const fieldErrors: FieldErrors = {};
          for (const e of data.errors) {
            (fieldErrors as any)[e.field] = e.message;
          }
          setErrors(fieldErrors);
          setStep(1);
        }
        if (data.fieldErrors) {
          setErrors(data.fieldErrors);
          setStep(1);
        }
        setServerErrors(data.error);
        setSubmitting(false);
        return;
      }

      setSuccess(true);
      setIsEdit(true);
      toast({ title: "Payment Setup Complete", description: "You can now publish products and receive orders." });

      // #1: Only auto-redirect if from onboarding flow
      if (fromOnboarding) {
        redirectTimerRef.current = setTimeout(() => navigate("/vendor", { replace: true }), 2000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save payment setup.";
      setServerErrors(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
    setSubmitting(false);
  };

  /* ── Loading / Auth guard ──────────────────────────────────────── */
  if (authLoading || loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-5 w-96" />
        <Card>
          <CardContent className="py-8 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // #3: Auth guard — redirect to login if not authenticated
  if (!user || !vendorId) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-4">You must be a registered vendor to access this page.</p>
        <Button onClick={() => navigate("/auth", { replace: true })}>
          Go to Login
        </Button>
      </div>
    );
  }

  // #2: Error state if fetch failed — show retry, disable form
  if (fetchError && !success) {
    return (
      <div className="max-w-md mx-auto px-4 py-20">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-10 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
            <h2 className="text-xl font-bold text-amber-700 dark:text-amber-400">
              Unable to Load Payment Setup
            </h2>
            <p className="text-muted-foreground">{fetchError}</p>
            <Button onClick={fetchSetup} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ── Success state ─────────────────────────────────────────────── */
  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-20">
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="py-10 text-center space-y-4">
            <ShieldCheck className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold text-green-700 dark:text-green-400">
              Payment Setup Complete ✓
            </h2>
            <p className="text-muted-foreground">
              Your payment destination has been configured. You can now publish products and receive orders.
            </p>
            {/* #1: Show auto-redirect message only if from onboarding */}
            {fromOnboarding && (
              <p className="text-xs text-muted-foreground">Redirecting to dashboard in 2 seconds…</p>
            )}
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <Button onClick={() => navigate("/vendor", { replace: true })}>
                Go to Dashboard
              </Button>
              {/* #5: Allow re-editing even after completion */}
              <Button
                variant="outline"
                onClick={() => {
                  setSuccess(false);
                  setStep(1);
                  setConfirmed(false);
                  if (redirectTimerRef.current) {
                    clearTimeout(redirectTimerRef.current);
                    redirectTimerRef.current = null;
                  }
                }}
              >
                Edit Payment Details
              </Button>
              <Button variant="outline" onClick={() => navigate("/vendor/products")}>
                Publish Your First Product
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ── Field helper ──────────────────────────────────────────────── */
  const fieldClass = (field: keyof FieldErrors) =>
    errors[field] ? "border-destructive" : "";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {isEdit ? "Edit Payment Setup" : "Complete Your Payment Setup"}
        </h1>
        <p className="text-muted-foreground mt-1">
          Your payment destination is required before you can publish products and receive orders.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${step === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-xs">1</span>
          Payment Method
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-xs">2</span>
          Review & Confirm
        </div>
      </div>

      {/* ── Step 1: Payment Method ──────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {errors.general && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errors.general}
            </div>
          )}

          {serverErrors && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {serverErrors}
            </div>
          )}

          {/* IFSC + Account */}
          <Card className={`transition-all ${form.useIfsc ? "border-primary/40 ring-1 ring-primary/20" : ""}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="use-ifsc"
                    checked={form.useIfsc}
                    onCheckedChange={(v) => update("useIfsc", !!v)}
                  />
                  <Label htmlFor="use-ifsc" className="text-base font-medium cursor-pointer flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-primary" />
                    Pay me via Bank Transfer (IFSC + Account)
                  </Label>
                </div>
                {form.useIfsc && form.ifscCode && form.accountNumber && !errors.ifscCode && !errors.accountNumber && (
                  <CheckCircle2 className="h-5 w-5 text-green-500 ml-auto" />
                )}
              </div>
            </CardHeader>
            {form.useIfsc && (
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-2">
                  <Label htmlFor="ifsc">IFSC Code</Label>
                  <Input
                    id="ifsc"
                    placeholder="e.g. HDFC0001234"
                    maxLength={11}
                    value={form.ifscCode}
                    onChange={(e) => update("ifscCode", e.target.value.toUpperCase())}
                    className={fieldClass("ifscCode")}
                  />
                  {errors.ifscCode && <p className="text-xs text-destructive">{errors.ifscCode}</p>}
                  <p className="text-xs text-muted-foreground">11 characters: 4 letters + 0 + 6 alphanumeric</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account">Account Number</Label>
                  <Input
                    id="account"
                    placeholder="e.g. 1234567890123"
                    maxLength={18}
                    value={form.accountNumber}
                    onChange={(e) => update("accountNumber", e.target.value.replace(/\D/g, ""))}
                    className={fieldClass("accountNumber")}
                  />
                  {errors.accountNumber && <p className="text-xs text-destructive">{errors.accountNumber}</p>}
                  <p className="text-xs text-muted-foreground">9–18 digits</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="holder">Account Holder Name</Label>
                  <Input
                    id="holder"
                    placeholder="Name as on bank account"
                    value={form.accountHolderName}
                    onChange={(e) => update("accountHolderName", e.target.value)}
                    className={fieldClass("accountHolderName")}
                  />
                  {errors.accountHolderName && <p className="text-xs text-destructive">{errors.accountHolderName}</p>}
                </div>
              </CardContent>
            )}
          </Card>

          {/* UPI */}
          <Card className={`transition-all ${form.useUpi ? "border-primary/40 ring-1 ring-primary/20" : ""}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="use-upi"
                    checked={form.useUpi}
                    onCheckedChange={(v) => update("useUpi", !!v)}
                  />
                  <Label htmlFor="use-upi" className="text-base font-medium cursor-pointer flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-primary" />
                    Pay me via UPI
                  </Label>
                </div>
                {form.useUpi && form.upiId && !errors.upiId && (
                  <CheckCircle2 className="h-5 w-5 text-green-500 ml-auto" />
                )}
              </div>
            </CardHeader>
            {form.useUpi && (
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-2">
                  <Label htmlFor="upi">UPI ID</Label>
                  <Input
                    id="upi"
                    placeholder="e.g. yourname@okhdfcbank"
                    value={form.upiId}
                    onChange={(e) => update("upiId", e.target.value)}
                    className={fieldClass("upiId")}
                  />
                  {errors.upiId && <p className="text-xs text-destructive">{errors.upiId}</p>}
                  <p className="text-xs text-muted-foreground">Format: username@bankname</p>
                </div>
              </CardContent>
            )}
          </Card>

          <Button onClick={goToReview} className="w-full" size="lg">
            Continue to Review <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}

      {/* ── Step 2: Review & Confirm ───────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Review Your Payment Details</CardTitle>
              <CardDescription>Please verify the information below before confirming.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.useIfsc && (
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Banknote className="h-4 w-4 text-primary" />
                    Bank Transfer (IFSC + Account)
                    <Badge variant="default" className="ml-auto">Active</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">IFSC Code: </span>
                      <span className="font-mono">{form.ifscCode}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Account: </span>
                      <span className="font-mono">{maskAccount(form.accountNumber)}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Holder: </span>
                      <span>{form.accountHolderName}</span>
                    </div>
                  </div>
                </div>
              )}
              {form.useUpi && (
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Smartphone className="h-4 w-4 text-primary" />
                    UPI
                    <Badge variant="default" className="ml-auto">Active</Badge>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">UPI ID: </span>
                    <span className="font-mono">{maskUpi(form.upiId)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 pt-2">
                <Checkbox
                  id="confirm"
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(!!v)}
                />
                <Label htmlFor="confirm" className="text-sm leading-relaxed cursor-pointer">
                  I confirm this information is correct and authorize KoshurKart to use it for vendor payments.
                </Label>
              </div>

              {serverErrors && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {serverErrors}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
              <ArrowLeft className="h-4 w-4 mr-2" /> Edit Details
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!confirmed || submitting}
              className="flex-1"
              size="lg"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
              ) : (
                <><ShieldCheck className="h-4 w-4 mr-2" /> Confirm & Continue</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorPaymentSetup;
