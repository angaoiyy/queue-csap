"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { PRIORITY_TYPES, MINUTES_PER_SLOT } from "@/lib/constants";
import { listSettingsItems } from "@/lib/actions/settings";
import { printReservationTicket } from "@/lib/printer/ticket";
import { getDisplaySettings } from "@/lib/actions/display-settings";

export type Reservation = {
  id: string;
  student_name: string;
  student_id: string;
  department: string;
  degree_program: string | null;
  term_school_year: string;
  inquiry_type: string;
  purpose_of_request: string | null;
  priority_type: string | null;
  is_priority: boolean;
  queue_number: string;
  position: number;
  status: string;
  window_id: string | null;
  called_at: string | null;
  window_name?: string | null;
  created_at: string;
  queue_date: string;
};

export type QueueWindow = {
  id: string;
  name: string;
  is_active: boolean;
};

export type WindowActionResult = { success: true } | { success: false; error: string };
export type ActivityAction =
  | "reservation_created"
  | "call_next"
  | "skip_ticket"
  | "window_count_changed";

export type CreateReservationInput = {
  student_name: string;
  student_id: string;
  department: string;
  degree_program: string;
  term_school_year: string;
  inquiry_type: string;
  purpose_of_request?: string;
  priority_type?: string;
};

export type CreateReservationResult =
  | { success: true; reservation: Reservation; printError?: string }
  | { success: false; error: string };

export async function createReservation(
  input: CreateReservationInput
): Promise<CreateReservationResult> {
  const supabase = await createClient();
  const manilaToday = getManilaDateString();
  const activeWindows = await getWindows();
  if (activeWindows.length === 0) {
    return { success: false, error: "No active windows configured for today" };
  }

  const [inquiryTypes, departments] = await Promise.all([
    listSettingsItems("inquiry_types", { activeOnly: true }),
    listSettingsItems("departments", { activeOnly: true }),
  ]);

  const inquiryTypeConfig = inquiryTypes.find(
    (type) => type.label === input.inquiry_type
  );
  if (!inquiryTypeConfig) {
    return { success: false, error: "Invalid inquiry type" };
  }

  const departmentConfig = departments.find(
    (department) => department.label === input.department
  );
  if (!departmentConfig) {
    return { success: false, error: "Invalid department" };
  }

  if (departmentConfig.requires_degree_program && !input.degree_program.trim()) {
    return { success: false, error: "Degree program is required" };
  }

  if (inquiryTypeConfig.requires_purpose && !input.purpose_of_request?.trim()) {
    return { success: false, error: "Purpose of request is required" };
  }

  const priorityType = input.priority_type?.trim() || null;
  if (
    priorityType &&
    !PRIORITY_TYPES.some((type) => type.value === priorityType)
  ) {
    return { success: false, error: "Invalid priority type" };
  }

  const { count, error: countError } = await supabase
    .from("reservations")
    .select("*", { count: "exact", head: true })
    .eq("queue_date", manilaToday)
    .eq("inquiry_type", input.inquiry_type)
    .in("status", ["waiting", "serving"]);

  if (countError) {
    return { success: false, error: countError.message };
  }

  const position = (count ?? 0) + 1;
  const queue_number = `${inquiryTypeConfig.prefix}${position.toString().padStart(3, "0")}`;
  const assignedWindow = await pickWindowForNewReservation(activeWindows);

  const { data, error } = await supabase
    .from("reservations")
    .insert({
      student_name: input.student_name,
      student_id: input.student_id,
      department: input.department,
      degree_program: departmentConfig.requires_degree_program
        ? input.degree_program
        : null,
      term_school_year: input.term_school_year,
      inquiry_type: input.inquiry_type,
      purpose_of_request: inquiryTypeConfig.requires_purpose
        ? input.purpose_of_request?.trim() || null
        : null,
      priority_type: priorityType,
      queue_number,
      position,
      status: "waiting",
      window_id: assignedWindow.id,
      queue_date: manilaToday,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/reserve");
  revalidatePath("/reserve/confirmation");
  revalidatePath("/display");
  revalidatePath("/dashboard/admin");

  await logActivity({
    action: "reservation_created",
    entity_type: "reservation",
    entity_id: (data as Reservation).id,
    metadata: {
      queue_number: (data as Reservation).queue_number,
      inquiry_type: input.inquiry_type,
      priority_type: priorityType,
      window_id: assignedWindow.id,
      window_name: assignedWindow.name,
      student_id: input.student_id,
      student_name: input.student_name,
    },
  });

  const reservation: Reservation = {
    ...(data as Reservation),
    window_name: assignedWindow.name,
  };

  let printError: string | undefined;
  try {
    const printResult = await printReservationTicket({
      queueNumber: reservation.queue_number,
      studentName: reservation.student_name,
      studentId: reservation.student_id,
      department: reservation.department,
      inquiryType: reservation.inquiry_type,
      windowName: assignedWindow.name,
      position: reservation.position,
      estimatedMinutes: (reservation.position - 1) * MINUTES_PER_SLOT,
      createdAt: new Date(reservation.created_at),
    });
    if (!printResult.success) {
      printError = printResult.error;
    }
  } catch (err) {
    printError = err instanceof Error ? err.message : "Unknown printer error";
  }

  return {
    success: true,
    reservation,
    ...(printError ? { printError } : {}),
  };
}

export type StudentLookupResult = {
  student_name: string;
  student_id: string;
  department: string;
  degree_program: string | null;
} | null;

export async function lookupStudent(query: string): Promise<StudentLookupResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;

  const escaped = escapeForIlike(trimmed);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("student_name, student_id, department, degree_program, created_at")
    .or(`student_id.ilike.%${escaped}%,student_name.ilike.%${escaped}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const [departments, degreePrograms] = await Promise.all([
    listSettingsItems("departments", { activeOnly: true }),
    listSettingsItems("degree_programs", { activeOnly: true }),
  ]);

  const department = departments.some((d) => d.label === data.department)
    ? data.department
    : null;
  const degree_program = degreePrograms.some((d) => d.label === data.degree_program)
    ? data.degree_program
    : null;

  if (!department) return null;

  return {
    student_name: data.student_name,
    student_id: data.student_id,
    department,
    degree_program,
  };
}

function escapeForIlike(value: string): string {
  return value.replace(/[%_,]/g, (char) => `\\${char}`);
}

export async function getActiveQueue() {
  noStore();
  const supabase = await createClient();
  const manilaToday = getManilaDateString();
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("queue_date", manilaToday)
    .in("status", ["waiting", "serving"])
    .order("is_priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as Reservation[];
}

export type DisplayData = {
  nowServingByWindow: Array<{
    windowId: string;
    windowName: string;
    queueNumber: string | null;
    inquiryType: string | null;
  }>;
  videoUrl: string | null;
  videoEnabled: boolean;
  audioEnabled: boolean;
  priorityNext: Array<{
    queueNumber: string;
    studentName: string;
    inquiryType: string;
    windowName: string;
  }>;
  assignedTickets: Array<{
    queueNumber: string;
    windowName: string;
    inquiryType: string;
    status: string;
  }>;
};

export type ActivityAnalytics = {
  totalQueueCreated: number;
  totalProcessed: number;
  liveWaiting: number;
  liveServing: number;
  actionsByType: Array<{ action: string; count: number }>;
  processedByWindow: Array<{ windowName: string; count: number }>;
};

export async function getDisplayData(): Promise<DisplayData> {
  noStore();
  const windows = await getWindows();
  const queue = await getActiveQueue();
  const displaySettings = await getDisplaySettings();

  return {
    nowServingByWindow: windows.map((window) => {
      const current = queue.find(
        (reservation) =>
          reservation.status === "serving" && reservation.window_id === window.id
      );
      return {
        windowId: window.id,
        windowName: window.name,
        queueNumber: current?.queue_number ?? null,
        inquiryType: current?.inquiry_type ?? null,
      };
    }),
    videoUrl: displaySettings.videoUrl,
    videoEnabled: displaySettings.isEnabled,
    audioEnabled: displaySettings.audioEnabled,
    priorityNext: queue
      .filter((reservation) => reservation.status === "waiting" && reservation.is_priority)
      .slice(0, 5)
      .map((reservation) => ({
        queueNumber: reservation.queue_number,
        studentName: reservation.student_name,
        inquiryType: reservation.inquiry_type,
        windowName:
          windows.find((window) => window.id === reservation.window_id)?.name ??
          "Unassigned",
      })),
    assignedTickets: queue
      .filter(
        (reservation) =>
          reservation.status === "serving" || reservation.status === "waiting"
      )
      .slice(0, 10)
      .map((reservation) => ({
        queueNumber: reservation.queue_number,
        windowName:
          windows.find((window) => window.id === reservation.window_id)?.name ??
          "Unknown Window",
        inquiryType: reservation.inquiry_type,
        status: reservation.status,
      })),
  };
}

export async function getActivityAnalytics(input: {
  fromISO: string;
  toISO: string;
  windowId?: string;
}): Promise<ActivityAnalytics> {
  noStore();
  const supabase = await createClient();
  const windowId = input.windowId?.trim() || "";

  let createdQuery = supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .gte("created_at", input.fromISO)
    .lte("created_at", input.toISO);
  let processedQuery = supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .in("status", ["completed", "skipped"])
    .gte("created_at", input.fromISO)
    .lte("created_at", input.toISO);
  let liveQuery = supabase
    .from("reservations")
    .select("status")
    .eq("queue_date", getManilaDateString())
    .in("status", ["waiting", "serving"]);
  let actionsQuery = supabase
    .from("activity_logs")
    .select("action, metadata")
    .gte("created_at", input.fromISO)
    .lte("created_at", input.toISO);

  if (windowId) {
    createdQuery = createdQuery.eq("window_id", windowId);
    processedQuery = processedQuery.eq("window_id", windowId);
    liveQuery = liveQuery.eq("window_id", windowId);
    actionsQuery = actionsQuery.filter("metadata->>window_id", "eq", windowId);
  }

  const [
    { count: createdCount },
    { count: processedCount },
    { data: liveData },
    { data: actionsData },
  ] = await Promise.all([createdQuery, processedQuery, liveQuery, actionsQuery]);

  const actionsMap = new Map<string, number>();
  (actionsData ?? []).forEach((row) => {
    actionsMap.set(row.action, (actionsMap.get(row.action) ?? 0) + 1);
  });

  const windows = await getAllWindows();
  const windowNameById = new Map(windows.map((w) => [w.id, w.name]));
  const processedByWindowMap = new Map<string, number>();
  (actionsData ?? []).forEach((row) => {
    if (row.action !== "call_next" && row.action !== "skip_ticket") return;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const wid = String(meta.window_id ?? "");
    if (!wid) return;
    const name = windowNameById.get(wid) ?? "Unknown Window";
    processedByWindowMap.set(name, (processedByWindowMap.get(name) ?? 0) + 1);
  });

  return {
    totalQueueCreated: createdCount ?? 0,
    totalProcessed: processedCount ?? 0,
    liveWaiting: (liveData ?? []).filter((r) => r.status === "waiting").length,
    liveServing: (liveData ?? []).filter((r) => r.status === "serving").length,
    actionsByType: Array.from(actionsMap.entries()).map(([action, count]) => ({
      action,
      count,
    })),
    processedByWindow: Array.from(processedByWindowMap.entries()).map(
      ([windowName, count]) => ({
        windowName,
        count,
      })
    ),
  };
}

export type CallNextResult = { success: true } | { success: false; error: string };

export async function getWindows(): Promise<QueueWindow[]> {
  noStore();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("windows")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }
  return data as QueueWindow[];
}

export async function getAllWindows(): Promise<QueueWindow[]> {
  noStore();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("windows")
    .select("id, name, is_active")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }
  return data as QueueWindow[];
}

export async function setAvailableWindowCount(count: number): Promise<WindowActionResult> {
  if (!Number.isInteger(count) || count <= 0) {
    return { success: false, error: "Window count must be at least 1" };
  }
  if (count > 20) {
    return { success: false, error: "Window count cannot exceed 20" };
  }

  const supabase = await createClient();
  const beforeCount = (await getWindows()).length;
  let allWindows = await getAllWindows();

  if (allWindows.length < count) {
    const inserts = [];
    for (let i = allWindows.length + 1; i <= count; i += 1) {
      inserts.push({ name: `Window ${i}`, is_active: true });
    }
    const { error: insertError } = await supabase
      .from("windows")
      .upsert(inserts, { onConflict: "name" });
    if (insertError) {
      return { success: false, error: insertError.message };
    }
    allWindows = await getAllWindows();
  }

  const ordered = [...allWindows].sort(
    (a, b) => getWindowSortNumber(a.name) - getWindowSortNumber(b.name)
  );
  const activeIds = ordered.slice(0, count).map((window) => window.id);
  const inactiveIds = ordered.slice(count).map((window) => window.id);

  if (activeIds.length > 0) {
    const { error: activeError } = await supabase
      .from("windows")
      .update({ is_active: true })
      .in("id", activeIds);
    if (activeError) {
      return { success: false, error: activeError.message };
    }
  }
  if (inactiveIds.length > 0) {
    const { error: inactiveError } = await supabase
      .from("windows")
      .update({ is_active: false })
      .in("id", inactiveIds);
    if (inactiveError) {
      return { success: false, error: inactiveError.message };
    }
  }

  const { error: rebalanceError } = await supabase.rpc("rebalance_waiting_tickets");
  if (rebalanceError) {
    return { success: false, error: rebalanceError.message };
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/display");

  await logActivity({
    action: "window_count_changed",
    entity_type: "window",
    entity_id: "windows",
    metadata: {
      previous_count: beforeCount,
      new_count: count,
      active_window_ids: activeIds,
    },
  });

  return { success: true };
}

export async function getWindowQueue(windowId: string): Promise<Reservation[]> {
  const queue = await getActiveQueue();
  return queue.filter((reservation) => reservation.window_id === windowId);
}

async function dispatchWindow(windowId: string, mode: "call_next" | "skip_current") {
  const supabase = await createClient();
  const window = await getWindowById(windowId);
  const { error } = await supabase.rpc("dispatch_window_queue", {
    p_window_id: windowId,
    p_mode: mode,
  });

  if (error) {
    return { success: false as const, error: error.message };
  }

  revalidatePath("/display");
  revalidatePath("/dashboard/admin");

  const { data: servingData } = await supabase
    .from("reservations")
    .select("id, queue_number, inquiry_type")
    .eq("status", "serving")
    .eq("window_id", windowId)
    .order("called_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await logActivity({
    action: mode === "call_next" ? "call_next" : "skip_ticket",
    entity_type: "window",
    entity_id: windowId,
    metadata: {
      window_id: windowId,
      window_name: window?.name ?? "Unknown Window",
      now_serving_queue: servingData?.queue_number ?? null,
      now_serving_inquiry_type: servingData?.inquiry_type ?? null,
      now_serving_reservation_id: servingData?.id ?? null,
    },
  });

  return { success: true as const };
}

async function pickWindowForNewReservation(windows: QueueWindow[]): Promise<QueueWindow> {
  const supabase = await createClient();
  const manilaToday = getManilaDateString();
  const windowIds = windows.map((window) => window.id);
  const { data, error } = await supabase
    .from("reservations")
    .select("window_id")
    .eq("queue_date", manilaToday)
    .in("status", ["waiting", "serving"])
    .in("window_id", windowIds);
  if (error) {
    throw error;
  }

  const loadByWindow = new Map<string, number>();
  windows.forEach((window) => loadByWindow.set(window.id, 0));
  (data ?? []).forEach((row) => {
    if (!row.window_id) return;
    loadByWindow.set(row.window_id, (loadByWindow.get(row.window_id) ?? 0) + 1);
  });

  const ordered = [...windows].sort((a, b) => {
    const loadDiff = (loadByWindow.get(a.id) ?? 0) - (loadByWindow.get(b.id) ?? 0);
    if (loadDiff !== 0) return loadDiff;
    return getWindowSortNumber(a.name) - getWindowSortNumber(b.name);
  });
  return ordered[0];
}

function getWindowSortNumber(name: string): number {
  const match = name.match(/\d+/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[0]);
}

function getManilaDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function getWindowById(windowId: string): Promise<QueueWindow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("windows")
    .select("id, name, is_active")
    .eq("id", windowId)
    .maybeSingle();
  if (error) return null;
  return (data as QueueWindow | null) ?? null;
}

async function logActivity(input: {
  action: ActivityAction;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims as { sub?: string; email?: string } | undefined;

    await supabase.from("activity_logs").insert({
      action: input.action,
      actor_user_id: claims?.sub ?? null,
      actor_email: claims?.email ?? null,
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Activity logging should not block queue operations.
  }
}

export async function callNextReservation(windowId: string): Promise<CallNextResult> {
  if (!windowId) {
    return { success: false, error: "Window is required" };
  }

  const result = await dispatchWindow(windowId, "call_next");
  if (!result.success) return result;

  return { success: true };
}

export async function skipCurrentReservation(windowId: string): Promise<CallNextResult> {
  if (!windowId) {
    return { success: false, error: "Window is required" };
  }

  const result = await dispatchWindow(windowId, "skip_current");
  if (!result.success) return result;

  return { success: true };
}
