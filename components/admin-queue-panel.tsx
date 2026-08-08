"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  callNextReservation,
  setAvailableWindowCount,
  skipCurrentReservation,
  type QueueWindow,
  type Reservation,
} from "@/lib/actions/reservation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AdminQueuePanel() {
  const PAGE_SIZE = 5;
  const [windows, setWindows] = useState<QueueWindow[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState("");
  const [windowCountInput, setWindowCountInput] = useState("1");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [queue, setQueue] = useState<Reservation[]>([]);
  const [isCalling, setIsCalling] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isSavingWindowCount, setIsSavingWindowCount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = async () => {
    const todayQueueDate = getManilaDateString();
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from("reservations")
      .select("*")
      .eq("queue_date", todayQueueDate)
      .in("status", ["waiting", "serving"])
      .order("is_priority", { ascending: false })
      .order("created_at", { ascending: true });
    if (queryError) {
      setError(queryError.message);
      return;
    }
    setQueue((data ?? []) as Reservation[]);
  };

  const loadWindows = async () => {
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from("windows")
      .select("id, name, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (queryError) {
      setError(queryError.message);
      return;
    }
    const active = (data ?? []) as QueueWindow[];
    setWindows(active);
    setWindowCountInput(String(active.length || 1));
    setSelectedWindowId((prev) => {
      if (prev && active.some((window) => window.id === prev)) return prev;
      return active[0]?.id ?? "";
    });
  };

  useEffect(() => {
    loadWindows();
    loadQueue();
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-reservations-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "windows" },
        async () => {
          await loadWindows();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservations" },
        async (payload) => {
          const eventType = payload.eventType;
          if (eventType === "INSERT" || eventType === "UPDATE") {
            const nextRow = payload.new as Reservation;
            if (nextRow.queue_date !== getManilaDateString()) {
              return;
            }
            setQueue((prev) => {
              const next = prev.filter((item) => item.id !== nextRow.id);
              if (nextRow.status === "waiting" || nextRow.status === "serving") {
                next.push(nextRow);
              }
              return next.sort((a, b) => {
                if (a.is_priority !== b.is_priority) {
                  return a.is_priority ? -1 : 1;
                }
                return (
                  new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
              });
            });
            return;
          }
          if (eventType === "DELETE") {
            const oldRow = payload.old as Reservation;
            setQueue((prev) => prev.filter((item) => item.id !== oldRow.id));
            return;
          }
          await loadQueue();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      loadQueue();
      loadWindows();
    }, 10000);
    return () => clearInterval(id);
  }, []);

  const handleCallNext = async () => {
    if (!selectedWindowId) {
      setError("Select a window first");
      return;
    }
    setIsCalling(true);
    setError(null);
    const result = await callNextReservation(selectedWindowId);
    if (result.success) {
      await loadQueue();
    } else {
      setError(result.error);
    }
    setIsCalling(false);
  };

  const handleSkipCurrent = async () => {
    if (!selectedWindowId) {
      setError("Select a window first");
      return;
    }
    setIsSkipping(true);
    setError(null);
    const result = await skipCurrentReservation(selectedWindowId);
    if (result.success) {
      await loadQueue();
    } else {
      setError(result.error);
    }
    setIsSkipping(false);
  };

  const handleSaveWindowCount = async () => {
    setIsSavingWindowCount(true);
    setError(null);
    const result = await setAvailableWindowCount(Number(windowCountInput));
    if (!result.success) {
      setError(result.error);
    } else {
      await loadWindows();
    }
    setIsSavingWindowCount(false);
  };

  const selectedWindow = windows.find((window) => window.id === selectedWindowId);
  const nowServing = queue.find(
    (reservation) =>
      reservation.status === "serving" && reservation.window_id === selectedWindowId
  );
  const filteredQueue = queue.filter((reservation) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      reservation.queue_number.toLowerCase().includes(q) ||
      reservation.student_name.toLowerCase().includes(q) ||
      reservation.student_id.toLowerCase().includes(q)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filteredQueue.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const paginatedQueue = filteredQueue.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Queue</h2>
        <div className="flex items-center gap-2">
          <Select value={selectedWindowId} onValueChange={setSelectedWindowId}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Select window" />
            </SelectTrigger>
            <SelectContent>
              {windows.map((window) => (
                <SelectItem key={window.id} value={window.id}>
                  {window.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleSkipCurrent}
            disabled={isSkipping || isCalling}
          >
            {isSkipping ? "Skipping..." : "Skip"}
          </Button>
          <Button onClick={handleCallNext} disabled={isCalling || isSkipping}>
            {isCalling ? "Calling..." : "Call Next"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        <span className="font-medium">
          {selectedWindow?.name ?? "Selected window"} now serving:
        </span>{" "}
        {nowServing?.queue_number ?? "—"}
      </div>

      <div className="grid gap-2">
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search queue #, name, or student ID"
        />
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Queue #</th>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Student ID</th>
              <th className="px-4 py-3 text-left font-medium">Department</th>
              <th className="px-4 py-3 text-left font-medium">Inquiry Type</th>
              <th className="px-4 py-3 text-left font-medium">Window</th>
              <th className="px-4 py-3 text-left font-medium">Term</th>
              <th className="px-4 py-3 text-left font-medium">Priority</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedQueue.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No reservations found
                </td>
              </tr>
            ) : (
              paginatedQueue.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono font-medium">
                    {r.queue_number}
                  </td>
                  <td className="px-4 py-3">{r.student_name}</td>
                  <td className="px-4 py-3">{r.student_id}</td>
                  <td className="px-4 py-3">{r.department}</td>
                  <td className="px-4 py-3">{r.inquiry_type}</td>
                  <td className="px-4 py-3">
                    {windows.find((window) => window.id === r.window_id)?.name ?? "Unknown"}
                  </td>
                  <td className="px-4 py-3">{r.term_school_year}</td>
                  <td className="px-4 py-3">
                    {r.priority_type ? (
                      <Badge variant="outline">{r.priority_type}</Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        r.status === "serving"
                          ? "default"
                          : r.status === "skipped"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          Page {page} of {totalPages} • {filteredQueue.length} result(s)
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-medium">Window Configuration</h3>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={20}
            placeholder="How many windows today?"
            value={windowCountInput}
            onChange={(e) => setWindowCountInput(e.target.value)}
          />
          <Button
            type="button"
            onClick={handleSaveWindowCount}
            disabled={isSavingWindowCount}
          >
            {isSavingWindowCount ? "Saving..." : "Save"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Active today: {windows.length} window(s)
        </p>
      </div>

      {(nowServing || queue.length > 0) && (
        <p className="text-sm text-muted-foreground">
          {selectedWindow?.name ?? "Window"} serving:{" "}
          {nowServing?.queue_number ?? "—"} • Active Queue: {queue.length}
        </p>
      )}
    </div>
  );
}

function getManilaDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
