"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  BellRing,
  LayoutGrid,
  ListPlus,
  Monitor,
  Radio,
  RefreshCw,
  Search,
  SkipForward,
  TicketPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

type Props = {
  officeSlug: string;
  officeId: string;
};

const ACTION_META: Record<
  string,
  { label: string; icon: typeof Activity; className: string }
> = {
  reservation_created: {
    label: "Reservation created",
    icon: TicketPlus,
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  },
  call_next: {
    label: "Call next",
    icon: BellRing,
    className:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  },
  skip_ticket: {
    label: "Skip ticket",
    icon: SkipForward,
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  },
  window_count_changed: {
    label: "Window count changed",
    icon: LayoutGrid,
    className:
      "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-950 dark:text-purple-300",
  },
};

function actionMeta(action: string) {
  return (
    ACTION_META[action] ?? {
      label: action.replace(/_/g, " "),
      icon: Activity,
      className: "border-border bg-muted text-muted-foreground",
    }
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

export function ActivityLogsTable({ officeSlug, officeId }: Props) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [windows, setWindows] = useState<QueueWindow[]>([]);
  const [analytics, setAnalytics] = useState<ActivityAnalytics | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [windowFilter, setWindowFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const getDateRange = useCallback(() => {
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T23:59:59.999`);
    return { fromISO: start.toISOString(), toISO: end.toISOString() };
  }, [fromDate, toDate]);

  const loadWindows = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("windows")
      .select("id, name, is_active, office_id")
      .eq("office_id", officeId)
      .order("name", { ascending: true });
    setWindows((data ?? []) as QueueWindow[]);
  }, [officeId]);

  const loadLogs = useCallback(async () => {
    const supabase = createClient();
    const { fromISO, toISO } = getDateRange();
    let query = supabase
      .from("activity_logs")
      .select("*")
      .eq("office_id", officeId)
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .order("created_at", { ascending: false })
      .limit(500);
    if (windowFilter !== "all") {
      query = query.filter("metadata->>window_id", "eq", windowFilter);
    }
    const { data, error: queryError } = await query;
    if (queryError) {
      setError(queryError.message);
      setLogs([]);
      return;
    }
    setError(null);
    setLogs((data ?? []) as ActivityLog[]);
  }, [getDateRange, officeId, windowFilter]);

  const loadAnalytics = useCallback(async () => {
    const { fromISO, toISO } = getDateRange();
    try {
      const data = await getActivityAnalytics({
        officeSlug,
        fromISO,
        toISO,
        windowId: windowFilter === "all" ? undefined : windowFilter,
      });
      setAnalytics(data);
    } catch {
      setAnalytics(null);
    }
  }, [getDateRange, officeSlug, windowFilter]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadLogs(), loadAnalytics(), loadWindows()]);
    setRefreshing(false);
  }, [loadLogs, loadAnalytics, loadWindows]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setFromDate(today);
    setToDate(today);
    loadWindows();
  }, [loadWindows]);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([loadLogs(), loadAnalytics()]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate, windowFilter, loadLogs, loadAnalytics]);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`activity-logs-changes-${officeSlug}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activity_logs",
          filter: `office_id=eq.${officeId}`,
        },
        async () => {
          await loadLogs();
          await loadAnalytics();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservations",
          filter: `office_id=eq.${officeId}`,
        },
        async () => {
          await loadAnalytics();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "windows",
          filter: `office_id=eq.${officeId}`,
        },
        async () => {
          await loadWindows();
          await loadAnalytics();
          await loadLogs();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    fromDate,
    toDate,
    windowFilter,
    officeId,
    officeSlug,
    loadLogs,
    loadAnalytics,
    loadWindows,
  ]);

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

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(end.toISOString().slice(0, 10));
  };

  const windowLabel = (log: ActivityLog): string => {
    const meta = log.metadata ?? {};
    const name = meta.window_name;
    if (typeof name === "string" && name) return name;
    const id = meta.window_id;
    if (typeof id === "string") {
      const match = windows.find((w) => w.id === id);
      if (match) return match.name;
    }
    return "—";
  };

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
      return `Window count ${previous} → ${next}`;
    }
    return "—";
  };

  const maxActionCount = Math.max(
    1,
    ...(analytics?.actionsByType ?? []).map((i) => i.count),
  );
  const maxWindowCount = Math.max(
    1,
    ...(analytics?.processedByWindow ?? []).map((i) => i.count),
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={ListPlus}
          label="Total Queues Created"
          value={analytics?.totalQueueCreated ?? 0}
          loading={loading && !analytics}
        />
        <StatCard
          icon={Activity}
          label="Total Processed"
          value={analytics?.totalProcessed ?? 0}
          loading={loading && !analytics}
        />
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Radio className="size-4" />
            Live Queue
          </div>
          <div className="mt-2 flex items-baseline gap-4">
            <div>
              <span className="text-2xl font-semibold tabular-nums">
                {analytics?.liveWaiting ?? 0}
              </span>{" "}
              <span className="text-xs text-muted-foreground">waiting</span>
            </div>
            <div>
              <span className="text-2xl font-semibold tabular-nums">
                {analytics?.liveServing ?? 0}
              </span>{" "}
              <span className="text-xs text-muted-foreground">serving</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Breakdown cards */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium">Actions by Type</p>
          <div className="space-y-2.5">
            {(analytics?.actionsByType ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No actions in selected range
              </p>
            ) : (
              [...(analytics?.actionsByType ?? [])]
                .sort((a, b) => b.count - a.count)
                .map((item) => {
                  const meta = actionMeta(item.action);
                  return (
                    <div key={item.action} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5">
                          <meta.icon className="size-3.5 text-muted-foreground" />
                          {meta.label}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {item.count}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{
                            width: `${(item.count / maxActionCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </Card>
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium">Processed by Window</p>
          <div className="space-y-2.5">
            {(analytics?.processedByWindow ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No processed items in selected range
              </p>
            ) : (
              [...(analytics?.processedByWindow ?? [])]
                .sort((a, b) => b.count - a.count)
                .map((item) => (
                  <div key={item.windowName} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{item.windowName}</span>
                      <span className="font-semibold tabular-nums">
                        {item.count}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-secondary"
                        style={{
                          width: `${(item.count / maxWindowCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
            )}
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            From
            <Input
              type="date"
              className="w-[9.5rem]"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <Input
              type="date"
              className="w-[9.5rem]"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setPreset(1)}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreset(7)}>
              7 days
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreset(30)}>
              30 days
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={refreshAll}
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search action, actor, or metadata"
              className="pl-8"
            />
          </div>
          <Select value={windowFilter} onValueChange={setWindowFilter}>
            <SelectTrigger className="w-44">
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
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Filter action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="reservation_created">
                Reservation created
              </SelectItem>
              <SelectItem value="call_next">Call next</SelectItem>
              <SelectItem value="skip_ticket">Skip ticket</SelectItem>
              <SelectItem value="window_count_changed">
                Window count changed
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Could not load activity logs</p>
            <p className="text-destructive/80">{error}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Time</th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
                <th className="px-4 py-3 text-left font-medium">Window</th>
                <th className="px-4 py-3 text-left font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td colSpan={4} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-14 text-center">
                    <Activity className="mx-auto size-6 text-muted-foreground/50" />
                    <p className="mt-2 font-medium">
                      {error ? "Failed to load logs" : "No activity yet"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {error
                        ? "Check your connection and try Refresh."
                        : "Staff actions in this date range will appear here."}
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((log) => {
                  const meta = actionMeta(log.action);
                  const win = windowLabel(log);
                  return (
                    <tr
                      key={log.id}
                      className="border-b align-top last:border-0 odd:bg-muted/20 hover:bg-muted/40"
                    >
                      <td
                        className="whitespace-nowrap px-4 py-3 text-muted-foreground"
                        title={new Date(log.created_at).toLocaleString("en-PH")}
                      >
                        {relativeTime(log.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={cn("gap-1 font-medium", meta.className)}
                        >
                          <meta.icon className="size-3" />
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {win === "—" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="flex items-center gap-1.5 font-medium">
                            <Monitor className="size-4 text-muted-foreground" />
                            {win}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {summarizeDetails(log)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          Page {safePage} of {totalPages} • {filtered.length} result
          {filtered.length === 1 ? "" : "s"}
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

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      {loading ? (
        <div className="mt-2 h-8 w-12 animate-pulse rounded bg-muted" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      )}
    </Card>
  );
}
