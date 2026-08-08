"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";

export type SettingsTable =
  | "school_years"
  | "departments"
  | "inquiry_types"
  | "degree_programs"
  | "purpose_of_request_options";

const TABLE_COLUMNS: Record<SettingsTable, string> = {
  school_years: "id, label, sort_order, is_active",
  departments: "id, label, requires_degree_program, sort_order, is_active",
  inquiry_types: "id, label, prefix, requires_purpose, sort_order, is_active",
  degree_programs: "id, label, sort_order, is_active",
  purpose_of_request_options: "id, label, sort_order, is_active",
};

export type SettingsItem = {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  prefix?: string;
  requires_degree_program?: boolean;
  requires_purpose?: boolean;
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
  options?: { activeOnly?: boolean }
): Promise<SettingsItem[]> {
  noStore();
  const supabase = await createClient();
  let query = supabase
    .from(table)
    .select(TABLE_COLUMNS[table])
    .order("sort_order", { ascending: true });
  if (options?.activeOnly) {
    query = query.eq("is_active", true);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as SettingsItem[];
}

export async function createSettingsItem(
  table: SettingsTable,
  input: SettingsItemInput
): Promise<SettingsActionResult> {
  const label = input.label.trim();
  if (!label) return { success: false, error: "Label is required" };
  if (table === "inquiry_types" && !input.prefix?.trim()) {
    return { success: false, error: "Prefix is required" };
  }

  const supabase = await createClient();
  const existing = await listSettingsItems(table);
  const nextOrder =
    existing.length > 0 ? Math.max(...existing.map((item) => item.sort_order)) + 1 : 0;

  const row: Record<string, unknown> = { label, sort_order: nextOrder, is_active: true };
  if (table === "inquiry_types") {
    row.prefix = input.prefix!.trim().toUpperCase();
    row.requires_purpose = input.requires_purpose ?? false;
  }
  if (table === "departments") {
    row.requires_degree_program = input.requires_degree_program ?? false;
  }

  const { error } = await supabase.from(table).insert(row);
  if (error) return { success: false, error: error.message };

  revalidateSettings(table);
  return { success: true };
}

export async function updateSettingsItem(
  table: SettingsTable,
  id: string,
  input: SettingsItemInput
): Promise<SettingsActionResult> {
  const label = input.label.trim();
  if (!label) return { success: false, error: "Label is required" };
  if (table === "inquiry_types" && !input.prefix?.trim()) {
    return { success: false, error: "Prefix is required" };
  }

  const row: Record<string, unknown> = { label };
  if (table === "inquiry_types") {
    row.prefix = input.prefix!.trim().toUpperCase();
    row.requires_purpose = input.requires_purpose ?? false;
  }
  if (table === "departments") {
    row.requires_degree_program = input.requires_degree_program ?? false;
  }

  const supabase = await createClient();
  const { error } = await supabase.from(table).update(row).eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidateSettings(table);
  return { success: true };
}

export async function setSettingsItemActive(
  table: SettingsTable,
  id: string,
  is_active: boolean
): Promise<SettingsActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ is_active }).eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidateSettings(table);
  return { success: true };
}

export async function reorderSettingsItems(
  table: SettingsTable,
  orderedIds: string[]
): Promise<SettingsActionResult> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from(table).update({ sort_order: index }).eq("id", id)
    )
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return { success: false, error: failed.error.message };

  revalidateSettings(table);
  return { success: true };
}

function revalidateSettings(_table: SettingsTable) {
  revalidatePath("/dashboard/settings");
  revalidatePath("/reserve");
}
