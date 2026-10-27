"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  callNextReservation,
  setAvailableWindowCount,
  skipCurrentReservation,
  type QueueWindow,
  type Reservation,
} from "@/lib/actions/reservation";
import {
  getDisplaySettings,
  setDisplayMarqueeText,
  setDisplayVideoEnabled,
  setDisplayVideoUrl,
} from "@/lib/actions/display-settings";
import { parseVideoEmbedUrl } from "@/lib/video";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { WindowQuotaPanel } from "@/components/window-quota-panel";
import { getWindowAssignment, switchWindow, releaseWindow, recallWindowTicket, type StaffWindowState } from "@/lib/actions/window-assignment";
import { usePolling } from "@/lib/use-polling";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  officeSlug: string;
  officeId: string;
  canManageOffice?: boolean;
};

export function AdminQueuePanel({ officeSlug, officeId, canManageOffice = false }: Props) {
  const PAGE_SIZE = 5;
  const [windows, setWindows] = useState<QueueWindow[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState("");
  const [windowCountInput, setWindowCountInput] = useState("1");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [queue, setQueue] = useState<Reservation[]>([]);
  const [isCalling, setIsCalling] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isRecalling, setIsRecalling] = useState(false);
  const [assignment, setAssignment] = useState<StaffWindowState | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const assignmentRequest = useRef(0);
  const assignmentBusy = useRef(false);
  const assignmentLoading = useRef(false);
  const lastAssignmentRead = useRef(0);
  const lastManualRefresh = useRef(0);
  const selectedWindowRef = useRef(selectedWindowId);
  selectedWindowRef.current = selectedWindowId;
  const [isSavingWindowCount, setIsSavingWindowCount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [savedVideoUrl, setSavedVideoUrl] = useState<string | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSavingVideoUrl, setIsSavingVideoUrl] = useState(false);
  const [isTogglingVideo, setIsTogglingVideo] = useState(false);
  const [videoUrlError, setVideoUrlError] = useState<string | null>(null);
  const [marqueeTextInput, setMarqueeTextInput] = useState("");
  const [isSavingMarqueeText, setIsSavingMarqueeText] = useState(false);
  const [marqueeTextError, setMarqueeTextError] = useState<string | null>(null);

  const applyAssignment = useCallback((state: StaffWindowState) => {
    setAssignment(state);
    setSelectedWindowId(state.currentWindowId ?? "");
    setAssignmentError(null);
  }, []);

  const loadAssignment = useCallback(async () => {
    if (assignmentBusy.current || assignmentLoading.current || document.visibilityState === "hidden" || !navigator.onLine) return;
    const request = ++assignmentRequest.current;
    assignmentLoading.current = true;
    try {
      const result = await getWindowAssignment(officeSlug);
      if (request !== assignmentRequest.current) return;
      if (result.success) { applyAssignment(result.state); lastAssignmentRead.current = Date.now(); }
      else {
        setAssignmentError("Could not check your window assignment. Please retry.");
        setSelectedWindowId("");
      }
    } catch {
      if (request === assignmentRequest.current) {
        setAssignmentError("Could not check your window assignment. Please retry.");
        setSelectedWindowId("");
      }
    } finally { assignmentLoading.current = false; }
  }, [officeSlug, applyAssignment]);

  usePolling(loadAssignment, 15000);

  useEffect(() => {
    if (!assignment?.expiresAt || !selectedWindowId) return;
    const timer = setTimeout(() => {
      setAssignmentError("Your window assignment expired. Select an available window again.");
      setSelectedWindowId("");
      void loadAssignment();
    }, Math.max(0, Date.parse(assignment.expiresAt) - Date.now() + 50));
    return () => clearTimeout(timer);
  }, [assignment?.expiresAt, selectedWindowId, loadAssignment]);

  const handleSwitchWindow = async (windowId: string | null) => {
    if (assignmentBusy.current || isCalling || isSkipping || isRecalling) return;
    assignmentBusy.current = true;
    assignmentRequest.current++;
    setIsSwitching(true);
    setError(null);
    let needsRefresh = true;
    try {
      if (windowId) {
        const result = await switchWindow(windowId);
        if (result.success) { applyAssignment(result.state); needsRefresh = false; }
        else setError(result.error);
      } else {
        const result = await releaseWindow();
        if (result.success) {
          setSelectedWindowId("");
          setAssignment((previous) => previous ? { ...previous, currentWindowId: null, expiresAt: null } : null);
        } else setError(result.error);
      }
    } catch {
      setError("Could not change your window assignment. Please retry.");
    } finally {
      assignmentBusy.current = false;
      setIsSwitching(false);
      // A successful switch already returned the complete authoritative state.
      // Refresh on release/failure to reconcile occupancy without polling.
      if (needsRefresh) await loadAssignment();
    }
  };

  const loadQueue = async () => {
    if (document.visibilityState === "hidden" || !navigator.onLine) return;
    const windowId = selectedWindowRef.current;
    if (!windowId) { setQueue([]); return; }
    const todayQueueDate = getManilaDateString();
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from("reservations")
      .select("*")
      .eq("office_id", officeId)
      .eq("window_id", windowId)
      .eq("queue_date", todayQueueDate)
      .in("status", ["waiting", "serving"])
      .order("is_priority", { ascending: false })
      .order("created_at", { ascending: true });
    if (windowId !== selectedWindowRef.current) return;
    if (queryError) {
      setError(queryError.message);
      return;
    }
    setQueue((data ?? []) as Reservation[]);
  };

  const loadWindows = async () => {
    if (document.visibilityState === "hidden" || !navigator.onLine) return;
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from("windows")
      .select("id, name, is_active, office_id")
      .eq("office_id", officeId)
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
      return "";
    });
  };

  const loadDisplaySettings = async () => {
    if (!canManageOffice || document.visibilityState === "hidden" || !navigator.onLine) return;
    const settings = await getDisplaySettings(officeId);
    setSavedVideoUrl(settings.videoUrl);
    setVideoUrlInput(settings.videoUrl ?? "");
    setIsVideoEnabled(settings.isEnabled);
    setMarqueeTextInput(settings.marqueeText);
  };

  useEffect(() => {
    loadWindows();
    loadDisplaySettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId]);

  usePolling(async () => {
    await Promise.all([loadQueue(), loadWindows()]);
  }, 10000, true, false);

  useEffect(() => {
    setQueue([]);
    setCurrentPage(1);
    void loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWindowId]);

  const handleCallNext = async () => {
    if (!selectedWindowId || isSwitching || assignmentError) {
      setError("Select a window first");
      return;
    }
    setIsCalling(true);
    setError(null);
    try {
      const result = await callNextReservation(officeSlug, selectedWindowId);
      if (result.success) await loadQueue();
      else setError(result.error);
    } catch {
      setError("Could not call the next ticket. Please retry.");
    } finally {
      setIsCalling(false);
      // Assignment ownership is checked atomically by the queue RPC.
    }
  };

  const callNextRef = useRef(handleCallNext);
  callNextRef.current = handleCallNext;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("dialog")) return;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        target?.isContentEditable ||
        target?.getAttribute("role") === "combobox"
      ) {
        return;
      }
      if (isCalling || isSkipping || isRecalling || isSwitching || !selectedWindowId) return;
      event.preventDefault();
      void callNextRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCalling, isSkipping, isRecalling, isSwitching, selectedWindowId]);

  const handleSkipCurrent = async () => {
    if (!selectedWindowId || isSwitching || assignmentError) {
      setError("Select a window first");
      return;
    }
    setIsSkipping(true);
    setError(null);
    try {
      const result = await skipCurrentReservation(officeSlug, selectedWindowId);
      if (result.success) await loadQueue();
      else setError(result.error);
    } catch {
      setError("Could not skip the current ticket. Please retry.");
    } finally {
      setIsSkipping(false);
      // Realtime carries the queue update; no assignment reread is needed.
    }
  };

  const handleRecall = async () => {
    if (!selectedWindowId || isSwitching || assignmentError) {
      setError("Select a window first");
      return;
    }
    if (!nowServing) {
      setError("No number is being served at this window yet");
      return;
    }
    setIsRecalling(true);
    setError(null);
    try {
      const result = await recallWindowTicket(selectedWindowId);
      if (!result.success) setError(result.error);
    } catch {
      setError("Could not send recall");
    }
    setIsRecalling(false);
  };

  const handleSaveWindowCount = async () => {
    setIsSavingWindowCount(true);
    setError(null);
    const result = await setAvailableWindowCount(officeSlug, Number(windowCountInput));
    if (!result.success) {
      setError(result.error);
    } else {
      await loadWindows();
    }
    setIsSavingWindowCount(false);
  };

  const handleSaveVideoUrl = async (value: string) => {
    setIsSavingVideoUrl(true);
    setVideoUrlError(null);
    const result = await setDisplayVideoUrl(officeSlug, value);
    if (result.success) {
      setSavedVideoUrl(value.trim() || null);
    } else {
      setVideoUrlError(result.error);
    }
    setIsSavingVideoUrl(false);
  };

  const handleToggleVideoEnabled = async (enabled: boolean) => {
    setIsTogglingVideo(true);
    setVideoUrlError(null);
    const previous = isVideoEnabled;
    setIsVideoEnabled(enabled);
    const result = await setDisplayVideoEnabled(officeSlug, enabled);
    if (!result.success) {
      setIsVideoEnabled(previous);
      setVideoUrlError(result.error);
    }
    setIsTogglingVideo(false);
  };

  const handleSaveMarqueeText = async (value: string) => {
    setIsSavingMarqueeText(true);
    setMarqueeTextError(null);
    const result = await setDisplayMarqueeText(officeSlug, value);
    if (!result.success) {
      setMarqueeTextError(result.error);
    }
    setIsSavingMarqueeText(false);
  };

  const showClaimColumn = queue.some((reservation) => reservation.claim_or_request);
  const columnCount = showClaimColumn ? 10 : 9;
  const selectedWindow = windows.find((window) => window.id === selectedWindowId);
  const controlsDisabled = !selectedWindowId || !!assignmentError || isSwitching || isCalling || isSkipping || isRecalling
    || !assignment?.expiresAt || new Date(assignment.expiresAt).getTime() <= Date.now();
  const nowServing = queue.find(
    (reservation) =>
      reservation.status === "serving" && reservation.window_id === selectedWindowId
  );
  const filteredQueue = queue.filter((reservation) => {
    if (reservation.window_id !== selectedWindowId) return false;
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      reservation.queue_number.toLowerCase().includes(q) ||
      reservation.student_name.toLowerCase().includes(q) ||
      (reservation.student_id ?? "").toLowerCase().includes(q)
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
      <WindowQuotaPanel key={selectedWindowId} officeSlug={officeSlug} currentWindowId={selectedWindowId} disabled={controlsDisabled} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Queue</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedWindowId} onOpenChange={(open) => { if (open && Date.now() - lastAssignmentRead.current > 5000) void loadAssignment(); }} onValueChange={(id) => void handleSwitchWindow(id)} disabled={isSwitching || isCalling || isSkipping || isRecalling || !assignment}>
            <SelectTrigger className="w-64" aria-label="Your service window">
              <SelectValue placeholder={isSwitching ? "Switching..." : "Choose an available window"} />
            </SelectTrigger>
            <SelectContent>
              {assignment?.windows.map((window) => (
                <SelectItem key={window.id} value={window.id} disabled={window.occupied && !window.isMine}>
                  {window.name} {window.isMine ? "(your window)" : window.occupied ? "(in use)" : "(available)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" disabled={isSwitching || isCalling || isSkipping || isRecalling}
            onClick={() => {
              if (Date.now() - lastManualRefresh.current < 1000) return;
              lastManualRefresh.current = Date.now();
              void loadAssignment(); void loadWindows(); void loadQueue();
            }}>Refresh</Button>
          <Button type="button" variant="outline" disabled={controlsDisabled} onClick={() => void handleSwitchWindow(null)}>Release Window</Button>
          <Button
            variant="outline"
            onClick={handleRecall}
            disabled={controlsDisabled || !nowServing}
            title="Re-announce the number currently being served on the display"
          >
            {isRecalling ? "Recalling..." : "Recall"}
          </Button>
          <Button
            variant="outline"
            onClick={handleSkipCurrent}
            disabled={controlsDisabled}
          >
            {isSkipping ? "Skipping..." : "Skip"}
          </Button>
          <Button
            onClick={handleCallNext}
            disabled={controlsDisabled}
            title="Press Enter to call next"
          >
            {isCalling ? "Calling..." : "Call Next"}
          </Button>
        </div>
      </div>

      {assignmentError ? <p role="alert" className="text-sm text-destructive">{assignmentError} <button type="button" className="underline" onClick={() => void loadAssignment()}>Retry</button></p>
        : <p role="status" className="text-sm text-muted-foreground">{selectedWindowId ? `You are operating ${selectedWindow?.name ?? "your selected window"}. Queue actions and quota changes apply only to this window.` : "Select an available window to start. Windows in use by another staff member cannot be selected."}</p>}

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
              {showClaimColumn && (
                <th className="px-4 py-3 text-left font-medium">Claim / Request</th>
              )}
              <th className="px-4 py-3 text-left font-medium">Window</th>
              <th className="px-4 py-3 text-left font-medium">Term</th>
              <th className="px-4 py-3 text-left font-medium">Priority</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedQueue.length === 0 ? (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
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
                  <td className="px-4 py-3">{r.student_id ?? "—"}</td>
                  <td className="px-4 py-3">{r.department}</td>
                  <td className="px-4 py-3">{r.inquiry_type}</td>
                  {showClaimColumn && (
                    <td className="px-4 py-3">
                      {r.claim_or_request ? (
                        <Badge variant="outline">{r.claim_or_request}</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
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

      {canManageOffice && <><div className="rounded-lg border p-4 space-y-3">
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

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Screen Video</h3>
          <div className="flex items-center gap-2">
            <Checkbox
              id="video_enabled"
              checked={isVideoEnabled}
              onCheckedChange={(checked) =>
                handleToggleVideoEnabled(checked === true)
              }
              disabled={isTogglingVideo}
            />
            <Label htmlFor="video_enabled" className="text-sm font-normal">
              Show on display
            </Label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="url"
            placeholder="Paste a YouTube or Vimeo link"
            value={videoUrlInput}
            onChange={(e) => setVideoUrlInput(e.target.value)}
          />
          <Button
            type="button"
            onClick={() => handleSaveVideoUrl(videoUrlInput)}
            disabled={isSavingVideoUrl}
          >
            {isSavingVideoUrl ? "Saving..." : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setVideoUrlInput("");
              handleSaveVideoUrl("");
            }}
            disabled={isSavingVideoUrl || !savedVideoUrl}
          >
            Clear
          </Button>
        </div>
        {videoUrlError && (
          <p className="text-sm text-destructive">{videoUrlError}</p>
        )}
        <p className="text-sm text-muted-foreground">
          {!isVideoEnabled
            ? "Disabled — display shows placeholder"
            : savedVideoUrl
              ? parseVideoEmbedUrl(savedVideoUrl)
                ? `Showing on display: ${savedVideoUrl}`
                : "Saved link could not be parsed"
              : "No video set — display shows placeholder"}
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-medium">Footer Marquee Text</h3>
        <div className="flex items-center gap-2">
          <Input
            type="text"
            placeholder="Text scrolling across the display footer"
            value={marqueeTextInput}
            onChange={(e) => setMarqueeTextInput(e.target.value)}
          />
          <Button
            type="button"
            onClick={() => handleSaveMarqueeText(marqueeTextInput)}
            disabled={isSavingMarqueeText}
          >
            {isSavingMarqueeText ? "Saving..." : "Save"}
          </Button>
        </div>
        {marqueeTextError && (
          <p className="text-sm text-destructive">{marqueeTextError}</p>
        )}
        <p className="text-sm text-muted-foreground">
          Scrolls across the bottom of the public display.
        </p>
      </div>

      </>}
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
