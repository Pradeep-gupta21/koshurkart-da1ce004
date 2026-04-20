import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { OnboardingDraftData } from "@/lib/validators/vendorOnboardingSchema";

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useOnboardingDraft() {
  const { user } = useAuth();
  const [data, setData] = useState<OnboardingDraftData>({});
  const [currentStep, setCurrentStep] = useState(1);
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ data: OnboardingDraftData; step: number }>({ data: {}, step: 1 });

  // Hydrate
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data: row } = await supabase
        .from("vendor_onboarding_drafts")
        .select("data, current_step")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!alive) return;
      if (row) {
        const d = (row.data as OnboardingDraftData) ?? {};
        setData(d);
        setCurrentStep(row.current_step ?? 1);
        latest.current = { data: d, step: row.current_step ?? 1 };
      }
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const flush = useCallback(async () => {
    if (!user) return;
    setSaveState("saving");
    const { error } = await supabase.from("vendor_onboarding_drafts").upsert(
      {
        user_id: user.id,
        data: latest.current.data as any,
        current_step: latest.current.step,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) {
      setSaveState("error");
    } else {
      setSaveState("saved");
      setSavedAt(new Date());
    }
  }, [user]);

  const scheduleSave = useCallback(() => {
    if (!user || !hydrated) return;
    if (timer.current) clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = setTimeout(() => {
      flush();
    }, 800);
  }, [user, hydrated, flush]);

  const updateStep = useCallback(
    <K extends keyof OnboardingDraftData>(key: K, value: OnboardingDraftData[K]) => {
      setData((prev) => {
        const next = { ...prev, [key]: { ...(prev[key] as object), ...(value as object) } } as OnboardingDraftData;
        latest.current.data = next;
        return next;
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const goTo = useCallback(
    (step: number) => {
      setCurrentStep(step);
      latest.current.step = step;
      scheduleSave();
    },
    [scheduleSave]
  );

  const clearDraft = useCallback(async () => {
    if (!user) return;
    await supabase.from("vendor_onboarding_drafts").delete().eq("user_id", user.id);
    setData({});
    setCurrentStep(1);
    latest.current = { data: {}, step: 1 };
  }, [user]);

  return { data, currentStep, hydrated, saveState, savedAt, updateStep, goTo, clearDraft, flush };
}
