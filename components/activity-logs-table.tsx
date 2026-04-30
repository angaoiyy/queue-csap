"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getActivityAnalytics,
  type ActivityAnalytics,
  type QueueWindow,
} from "@/lib/actions/reservation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ActivityLog = {
  id: string;
  action: string;
  actor_email: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const PAGE_SIZE = 10;

export function ActivityLogsTable() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [windows, setWindows] = useState<QueueWindow[]>([]);
  const [analytics, setAnalytics] = useState<ActivityAnalytics | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [windowFilter, setWindowFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(1);

  const getDateRange = () => {
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T23:59:59.999`);
    return { fromISO: start.toISOString(), toISO: end.toISOString() };
  };

  const loadWindows = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("windows")
      .select("id, name, is_active")
      .order("name", { ascending: true });
    setWindows((data ?? []) as QueueWindow[]);
  };

  const loadLogs = async () => {
    const supabase = createClient();
    const { fromISO, toISO } = getDateRange();
    let query = supabase
      .from("activity_logs")
      .select("*")
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .order("created_at", { ascending: false })
      .limit(500);
    if (windowFilter !== "all") {
      query = query.filter("metadata->>window_id", "eq", windowFilter);
    }
    const { data } = await query;
    setLogs((data ?? []) as ActivityLog[]);
  };

  const loadAnalytics = async () => {
    const { fromISO, toISO } = getDateRange();
    const data = await getActivityAnalytics({
      fromISO,
      toISO,
      windowId: windowFilter === "all" ? undefined : windowFilter,
    });
    setAnalytics(data);
  };

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setFromDate(today);
    setToDate(today);
    loadWindows();
  }, []);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    loadLogs();
    loadAnalytics();
  }, [fromDate, toDate, windowFilter]);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    const supabase = createClient();
    const channel = supabase
      .channel("activity-logs-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activity_logs" },
        async () => {
          await loadLogs();
          await loadAnalytics();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservations" },
        async () => {
          await loadAnalytics();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "windows" },
        async () => {
          await loadWindows();
          await loadAnalytics();
          await loadLogs();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fromDate, toDate, windowFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, actionFilter, fromDate, toDate, windowFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      const actionMatch = actionFilter === "all" || log.action === actionFilter;
      if (!actionMatch) return false;
      if (!q) return true;
      return (
        log.action.toLowerCase().includes(q) ||
        (log.actor_email ?? "").toLowerCase().includes(q) ||
        JSON.stringify(log.metadata).toLowerCase().includes(q)
      );
    });
  }, [logs, search, actionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const summarizeDetails = (log: ActivityLog) => {
    const meta = log.metadata ?? {};
    if (log.action === "reservation_created") {
      const queue = String(meta.queue_number ?? "-");
      const inquiry = String(meta.inquiry_type ?? "-");
      const window = String(meta.window_name ?? "-");
      return `Queue ${queue} • ${inquiry} • ${window}`;
    }
    if (log.action === "call_next" || log.action === "skip_ticket") {
      const queue = String(meta.now_serving_queue ?? "-");
      const inquiry = String(meta.now_serving_inquiry_type ?? "-");
      const window = String(meta.window_name ?? "-");
      return `Now serving ${queue} • ${inquiry} • ${window}`;
    }
    if (log.action === "window_count_changed") {
      const previous = String(meta.previous_count ?? "-");
      const next = String(meta.new_count ?? "-");
      return `Window count changed: ${previous} -> ${next}`;
    }
    return "No additional details";
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total Queues Created</p>
          <p className="text-2xl font-semibold">{analytics?.totalQueueCreated ?? 0}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total Processed</p>
          <p className="text-2xl font-semibold">{analytics?.totalProcessed ?? 0}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Live Queue</p>
          <p className="text-sm">
            Waiting: <span className="font-semibold">{analytics?.liveWaiting ?? 0}</span> •
            Serving: <span className="font-semibold"> {analytics?.liveServing ?? 0}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium">Actions by Type</p>
          <div className="space-y-1 text-sm">
            {(analytics?.actionsByType ?? []).length === 0 ? (
              <p className="text-muted-foreground">No actions in selected range</p>
            ) : (
              (analytics?.actionsByType ?? []).map((item) => (
                <p key={item.action}>
                  {item.action}: <span className="font-semibold">{item.count}</span>
                </p>
              ))
            )}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium">Processed by Window</p>
          <div className="space-y-1 text-sm">
            {(analytics?.processedByWindow ?? []).length === 0 ? (
              <p className="text-muted-foreground">No processed items in selected range</p>
            ) : (
              (analytics?.processedByWindow ?? []).map((item) => (
                <p key={item.windowName}>
                  {item.windowName}: <span className="font-semibold">{item.count}</span>
                </p>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <Select value={windowFilter} onValueChange={setWindowFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Filter window" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All windows</SelectItem>
            {windows.map((window) => (
              <SelectItem key={window.id} value={window.id}>
                {window.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search action, actor, or metadata"
        />
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Filter action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="reservation_created">Reservation created</SelectItem>
            <SelectItem value="call_next">Call next</SelectItem>
            <SelectItem value="skip_ticket">Skip ticket</SelectItem>
            <SelectItem value="window_count_changed">Window count changed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Time</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
              <th className="px-4 py-3 text-left font-medium">Actor</th>
              <th className="px-4 py-3 text-left font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No activity logs found
                </td>
              </tr>
            ) : (
              rows.map((log) => (
                <tr key={log.id} className="border-b last:border-0 align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("en-PH")}
                  </td>
                  <td className="px-4 py-3">{log.action}</td>
                  <td className="px-4 py-3">{log.actor_email ?? "System"}</td>
                  <td className="px-4 py-3">{summarizeDetails(log)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          Page {safePage} of {totalPages} • {filtered.length} result(s)
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
