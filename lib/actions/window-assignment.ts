"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveOfficeId } from "@/lib/offices";

export type StaffWindowState = {
  currentWindowId: string | null;
  expiresAt: string | null;
  windows: Array<{ id: string; name: string; occupied: boolean; isMine: boolean }>;
};
type StateResult = { success: true; state: StaffWindowState } | { success: false; error: string };

export async function getWindowAssignment(officeSlug: string): Promise<StateResult> {
  try {
    const officeId = await resolveOfficeId(officeSlug);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_staff_window_state", { p_office_id: officeId });
    if (error) return { success: false, error: error.message };
    return { success: true, state: data as StaffWindowState };
  } catch {
    return { success: false, error: "Could not check your window assignment. Please retry." };
  }
}

export async function switchWindow(windowId: string): Promise<StateResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("switch_staff_window", { p_window_id: windowId });
    if (error) return { success: false, error: error.message.replace("WINDOW_OCCUPIED: ", "") };
    return { success: true, state: data as StaffWindowState };
  } catch {
    return { success: false, error: "Could not switch windows. Please retry." };
  }
}

export async function releaseWindow(): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("release_staff_window");
    return error ? { success: false, error: error.message } : { success: true };
  } catch {
    return { success: false, error: "Could not release your window. Please retry." };
  }
}

export async function recallWindowTicket(windowId: string): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("recall_window_ticket", { p_window_id: windowId });
    return error ? { success: false, error: error.message } : { success: true };
  } catch {
    return { success: false, error: "Could not recall the current ticket. Please retry." };
  }
}
