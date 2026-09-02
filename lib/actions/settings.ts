"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { resolveOfficeId } from "@/lib/offices";

export type SettingsTable =
  | "school_years"
  | "departments"
  | "inquiry_types"
  | "admission_inquiry_types"
  | "degree_programs"
  | "purpose_of_request_options";

const TABLE_COLUMNS: Record<SettingsTable, string> = {
  school_years: "id, label, sort_order, is_active, office_id",
  departments: "id, label, requires_degree_program, sort_order, is_active, office_id",
  inquiry_types: "id, label, prefix, requires_purpose, sort_order, is_active, office_id",
  admission_inquiry_types:
    "id, label, prefix, requires_purpose, sort_order, is_active, office_id",
  degree_programs: "id, label, department_id, sort_order, is_active, office_id",
  purpose_of_request_options: "id, label, sort_order, is_active, office_id",
};

export type SettingsItem = {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  office_id: string;
  prefix?: string;
  requires_degree_program?: boolean;
  requires_purpose?: boolean;
  department_id?: string | null;
};

export type SettingsItemInput = {
  label: string;
  prefix?: string;
  requires_degree_program?: boolean;
  requires_purpose?: boolean;
};

export type SettingsActionResult = { success: true } | { success: false; error: string };

export async function listSettingsItems(
  table: SettingsTable,
  options: { officeId: string; activeOnly?: boolean }
): Promise<SettingsItem[]> {
  noStore();
  const supabase = await createClient();
  let query = supabase
    .from(table)
    .select(TABLE_COLUMNS[table])
    .eq("office_id", options.officeId)
    .order("sort_order", { ascending: true });
  if (options.activeOnly) {
    query = query.eq("is_active", true);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as SettingsItem[];
}

export async function createSettingsItem(
  table: SettingsTable,
  input: SettingsItemInput,
  officeSlug: string
): Promise<SettingsActionResult> {
  const label = input.label.trim();
  if (!label) return { success: false, error: "Label is required" };
  if ((table === "inquiry_types" || table === "admission_inquiry_types") && !input.prefix?.trim()) {
    return { success: false, error: "Prefix is required" };
  }

  const officeId = await resolveOfficeId(officeSlug);
  const supabase = await createClient();
  const existing = await listSettingsItems(table, { officeId });
  const nextOrder =
    existing.length > 0 ? Math.max(...existing.map((item) => item.sort_order)) + 1 : 0;

  const row: Record<string, unknown> = {
    label,
    sort_order: nextOrder,
    is_active: true,
    office_id: officeId,
  };
  if (table === "inquiry_types" || table === "admission_inquiry_types") {
    row.prefix = input.prefix!.trim().toUpperCase();
    row.requires_purpose = input.requires_purpose ?? false;
  }
  if (table === "departments") {
    row.requires_degree_program = input.requires_degree_program ?? false;
  }

  const { error } = await supabase.from(table).insert(row);
  if (error) return { success: false, error: error.message };

  revalidateSettings(officeSlug);
  return { success: true };
}

export async function updateSettingsItem(
  table: SettingsTable,
  id: string,
  input: SettingsItemInput,
  officeSlug: string
): Promise<SettingsActionResult> {
  const label = input.label.trim();
  if (!label) return { success: false, error: "Label is required" };
  if ((table === "inquiry_types" || table === "admission_inquiry_types") && !input.prefix?.trim()) {
    return { success: false, error: "Prefix is required" };
  }

  const officeId = await resolveOfficeId(officeSlug);
  const row: Record<string, unknown> = { label };
  if (table === "inquiry_types" || table === "admission_inquiry_types") {
    row.prefix = input.prefix!.trim().toUpperCase();
    row.requires_purpose = input.requires_purpose ?? false;
  }
  if (table === "departments") {
    row.requires_degree_program = input.requires_degree_program ?? false;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .update(row)
    .eq("id", id)
    .eq("office_id", officeId);
  if (error) return { success: false, error: error.message };

  revalidateSettings(officeSlug);
  return { success: true };
}

export async function setSettingsItemActive(
  table: SettingsTable,
  id: string,
  is_active: boolean,
  officeSlug: string
): Promise<SettingsActionResult> {
  const officeId = await resolveOfficeId(officeSlug);
  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .update({ is_active })
    .eq("id", id)
    .eq("office_id", officeId);
  if (error) return { success: false, error: error.message };

  revalidateSettings(officeSlug);
  return { success: true };
}

export async function reorderSettingsItems(
  table: SettingsTable,
  orderedIds: string[],
  officeSlug: string
): Promise<SettingsActionResult> {
  const officeId = await resolveOfficeId(officeSlug);
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from(table)
        .update({ sort_order: index })
        .eq("id", id)
        .eq("office_id", officeId)
    )
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return { success: false, error: failed.error.message };

  revalidateSettings(officeSlug);
  return { success: true };
}

function revalidateSettings(slug: string) {
  revalidatePath(`/dashboard/${slug}/settings`);
  revalidatePath(`/${slug}/reserve`);
  revalidatePath(`/${slug}/reserve/old`);
  revalidatePath(`/${slug}/reserve/new`);
}
