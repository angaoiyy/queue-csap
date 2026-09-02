"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import {
  getSessionProfile,
  type StaffRole,
  type StaffStatus,
} from "@/lib/offices";

export type StaffProfile = {
  id: string;
  email: string | null;
  role: StaffRole;
  status: StaffStatus;
  created_at: string;
  officeSlug: string | null;
  officeLabel: string | null;
};

export type StaffActionResult = { success: true } | { success: false; error: string };

async function requireSuperAdmin() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "super_admin") {
    throw new Error("Forbidden");
  }
  return profile;
}

export async function listStaffProfiles(): Promise<StaffProfile[]> {
  noStore();
  await requireSuperAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, status, created_at, offices(slug, label)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((raw) => {
    const row = raw as {
      id: string;
      email: string | null;
      role: StaffRole;
      status: StaffStatus;
      created_at: string;
      offices: unknown;
    };
    const joined = row.offices;
    const office = (Array.isArray(joined) ? joined[0] : joined) as
      | { slug: string; label: string }
      | undefined;
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      created_at: row.created_at,
      officeSlug: office?.slug ?? null,
      officeLabel: office?.label ?? null,
    };
  });
}

export async function setStaffStatus(
  userId: string,
  status: StaffStatus
): Promise<StaffActionResult> {
  const me = await requireSuperAdmin();

  if (userId === me.id) {
    return { success: false, error: "You cannot change your own account status." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", userId)
    .neq("role", "super_admin")
    .select("id")
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Staff account not found." };

  revalidatePath("/dashboard/staff");
  return { success: true };
}
