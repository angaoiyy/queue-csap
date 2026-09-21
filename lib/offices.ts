import "server-only";

import { cache } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type Office = {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  requires_claim_request: boolean;
};

export type SessionOffice = { id: string; slug: string; label: string };

export type StaffRole = "staff" | "super_admin";
export type StaffStatus = "pending" | "approved" | "rejected";

export type SessionProfile = {
  id: string;
  role: StaffRole;
  status: StaffStatus;
  office: SessionOffice | null;
};

const OFFICE_COLUMNS =
  "id, slug, label, sort_order, is_active, requires_claim_request";

// Offices are public config (RLS: anyone can read). Use a plain anon client with
// no cookie access so these lookups can live in the "use cache" scope.
function anonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

export const getAllOffices = cache(async (): Promise<Office[]> => {
  const supabase = anonClient();
  const { data, error } = await supabase
    .from("offices")
    .select(OFFICE_COLUMNS)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Office[];
});

export async function getOfficeBySlug(slug: string): Promise<Office | null> {
  "use cache";
  const supabase = anonClient();
  const { data, error } = await supabase
    .from("offices")
    .select(OFFICE_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) return null;
  return (data as Office | null) ?? null;
}

export async function resolveOfficeId(slug: string): Promise<string> {
  const office = await getOfficeBySlug(slug);
  if (!office) {
    throw new Error(`Unknown office: ${slug}`);
  }
  return office.id;
}

export const getSessionProfile = cache(
  async (): Promise<SessionProfile | null> => {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub as string | undefined;
    if (!userId) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, status, office_id, offices(id, slug, label)")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as {
      id: string;
      role: string | null;
      status: string | null;
      offices: unknown;
    };

    const joined = row.offices;
    const office = (Array.isArray(joined) ? joined[0] : joined) as
      | { id: string; slug: string; label: string }
      | undefined;

    return {
      id: row.id,
      role: (row.role as StaffRole) ?? "staff",
      status: (row.status as StaffStatus) ?? "pending",
      office: office
        ? { id: office.id, slug: office.slug, label: office.label }
        : null,
    };
  }
);

export async function requireSuperAdmin(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "super_admin") {
    throw new Error("Forbidden");
  }
  return profile;
}

export const getSessionOffice = cache(
  async (): Promise<SessionOffice | null> => {
    const profile = await getSessionProfile();
    return profile?.office ?? null;
  }
);
