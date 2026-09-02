"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { resolveOfficeId } from "@/lib/offices";

export type OfficeSettingsActionResult =
  | { success: true }
  | { success: false; error: string };

export async function setOfficeRequiresClaimRequest(
  officeSlug: string,
  enabled: boolean
): Promise<OfficeSettingsActionResult> {
  const officeId = await resolveOfficeId(officeSlug);
  const supabase = await createClient();
  const { error } = await supabase
    .from("offices")
    .update({ requires_claim_request: enabled })
    .eq("id", officeId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/${officeSlug}/settings`);
  revalidatePath(`/${officeSlug}/reserve/old`);
  revalidatePath(`/${officeSlug}/reserve/new`);
  return { success: true };
}
