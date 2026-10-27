"use server";

import { unstable_noStore as noStore, revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile, resolveOfficeId } from "@/lib/offices";
import { validateQuotaPeriods, type QuotaAvailability, type QuotaPeriod } from "@/lib/quotas";

export async function getQuotaAvailability(officeSlug: string): Promise<QuotaAvailability> {
  noStore();
  const officeId = await resolveOfficeId(officeSlug);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_window_quota_availability", { p_office_id: officeId });
  if (error) throw new Error("Could not load reservation availability. Please try again.");
  return data as QuotaAvailability;
}

export async function saveWindowQuota(input: {
  officeSlug: string;
  windowId: string;
  date: string;
  enabled: boolean;
  periods: QuotaPeriod[];
}): Promise<{ success: true } | { success: false; error: string }> {
  const profile = await getSessionProfile();
  if (!profile?.office || profile.office.slug !== input.officeSlug ||
    (profile.status !== "approved" && profile.role !== "super_admin")) {
    return { success: false, error: "Forbidden" };
  }
  if (typeof input.enabled !== "boolean" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { success: false, error: "Invalid quota configuration." };
  }
  const validationError = validateQuotaPeriods(input.enabled, input.periods);
  if (validationError) return { success: false, error: validationError };
  const supabase = await createClient();
  const { error } = await supabase.from("window_daily_quotas").upsert({
    window_id: input.windowId,
    office_id: profile.office.id,
    quota_date: input.date,
    enabled: input.enabled,
    periods: [...input.periods].sort((a, b) => a.start.localeCompare(b.start)),
  }, { onConflict: "window_id,quota_date" });
  if (error) return { success: false, error: error.message };
  revalidatePath(`/dashboard/${input.officeSlug}/admin`);
  revalidatePath(`/${input.officeSlug}/reserve`);
  return { success: true };
}
