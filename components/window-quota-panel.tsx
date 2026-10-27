"use client";

import { useRef, useState } from "react";
import { saveWindowQuota } from "@/lib/actions/quotas";
import { formatQuotaTime, quotaStatus, validateQuotaPeriods, type QuotaPeriod, type WindowQuota } from "@/lib/quotas";
import { useQuotaAvailability } from "@/lib/use-quota-availability";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimePicker } from "@/components/ui/time-picker";

export function WindowQuotaPanel({ officeSlug, currentWindowId, disabled = false }: { officeSlug: string; currentWindowId: string; disabled?: boolean }) {
  const { availability, error: loadError, refresh } = useQuotaAvailability(officeSlug);
  const dialog = useRef<HTMLDialogElement>(null);
  const [windowId, setWindowId] = useState("");
  const [date, setDate] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [periods, setPeriods] = useState<QuotaPeriod[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function selectWindow(window: WindowQuota) {
    setWindowId(window.id);
    setEnabled(window.enabled);
    setPeriods(window.periods.map((period) => ({ ...period })));
    setError(null);
    setSaved(false);
  }

  function openDialog() {
    const currentWindow = availability?.windows.find((window) => window.id === currentWindowId);
    if (!availability || !currentWindow || disabled) return;
    setDate(availability.date);
    selectWindow(currentWindow);
    dialog.current?.showModal();
  }

  function updatePeriod(index: number, change: Partial<QuotaPeriod>) {
    setPeriods((previous) => previous.map((period, i) => i === index ? { ...period, ...change } : period));
    setSaved(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || disabled || windowId !== currentWindowId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // Switching off must still work if an unfinished new period is in the draft.
      const savedPeriods = !enabled && validateQuotaPeriods(false, periods)
        ? availability?.windows.find((window) => window.id === windowId)?.periods ?? []
        : periods;
      const result = await saveWindowQuota({ officeSlug, windowId, date, enabled, periods: savedPeriods });
      if (!result.success) setError(result.error);
      else {
        setPeriods(savedPeriods);
        setSaved(true);
        await refresh();
      }
    } catch {
      setError("Could not save quotas. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Window quotas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Today&apos;s Window Quotas</h3>
          <p className="text-sm text-muted-foreground">Optional limits on waiting and serving tickets. Philippine time.</p>
        </div>
        <Button type="button" variant="outline" onClick={openDialog} disabled={disabled || !currentWindowId || !availability?.windows.some((window) => window.id === currentWindowId) || !!loadError}>
          Configure Quotas
        </Button>
      </div>
      {loadError && <p role="alert" className="text-sm text-destructive">{loadError} <button type="button" className="underline" onClick={() => void refresh()}>Retry</button></p>}
      {!availability && !loadError && <p className="text-sm text-muted-foreground">Loading quotas...</p>}
      {availability && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
        {availability.windows.filter((window) => window.id === currentWindowId).map((window) => {
          const status = quotaStatus(window);
          return <div key={window.id} className="rounded-md border px-3 py-2 text-sm">
            <p className="font-medium">{window.name}</p>
            <p>{status === "unlimited" ? `Quota off · ${window.activeCount} active`
              : status === "closed" ? `Closed for new reservations · ${window.activeCount} active`
                : `${window.activeCount} / ${window.capacity} active · ${status === "full" ? "Full" : "Available"}`}</p>
            {window.enabled && window.periods.map((period, index) => <p key={index} className="text-xs text-muted-foreground">
              {formatQuotaTime(period.start)}–{formatQuotaTime(period.end)}: {period.capacity}
            </p>)}
          </div>;
        })}
        {!availability.windows.length && <p className="text-sm text-muted-foreground">No active service windows.</p>}
        {!currentWindowId && availability.windows.length > 0 && <p className="text-sm text-muted-foreground">Claim a window below to view and configure its quota.</p>}
      </div>}

      <dialog ref={dialog} aria-labelledby="quota-dialog-title" aria-describedby="quota-dialog-description"
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/50"
        onCancel={(event) => { if (saving) event.preventDefault(); }}>
        <form onSubmit={save} className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="quota-dialog-title" className="text-xl font-semibold">Configure Quotas</h2>
              <p id="quota-dialog-description" className="text-sm text-muted-foreground">For {date} only, in Philippine time. Quotas switch off tomorrow.</p>
            </div>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => dialog.current?.close()}>Close</Button>
          </div>
          {availability?.date !== date && <p role="alert" className="text-sm text-destructive">The date has changed. Close and reopen this dialog to configure today.</p>}
          <div className="grid gap-2">
            <p className="text-sm font-medium">Your service window</p>
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{availability?.windows.find((window) => window.id === windowId)?.name ?? "No window selected"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="quota-enabled" checked={enabled} disabled={saving}
              onCheckedChange={(checked) => { setEnabled(checked === true); setSaved(false); }} />
            <Label htmlFor="quota-enabled">Enable quota for this window today</Label>
          </div>
          <p className="text-sm text-muted-foreground">When enabled, new tickets are accepted only during these periods. All waiting and serving tickets count, including earlier periods. Completed or skipped tickets free a slot.</p>
          <fieldset disabled={saving || !enabled} className="space-y-3 disabled:opacity-50">
            <legend className="sr-only">Time periods and limits</legend>
            {periods.map((period, index) => <div key={index} className="grid grid-cols-1 items-end gap-3 rounded-md border p-3 sm:grid-cols-2">
              <TimePicker id={`quota-start-${index}`} label="Start time" value={period.start} onChange={(start) => updatePeriod(index, { start })} />
              <TimePicker id={`quota-end-${index}`} label="End time" value={period.end} onChange={(end) => updatePeriod(index, { end })} />
              <div className="space-y-1"><Label htmlFor={`quota-capacity-${index}`}>Quota</Label>
                <Input id={`quota-capacity-${index}`} type="number" min="1" max="2147483647" step="1" required value={Number.isNaN(period.capacity) ? "" : period.capacity}
                  placeholder="Enter limit" onChange={(event) => updatePeriod(index, { capacity: event.target.valueAsNumber })} /></div>
              <Button type="button" variant="outline" className="justify-self-end" aria-label={`Remove period ${index + 1}`}
                onClick={() => { setPeriods((previous) => previous.filter((_, i) => i !== index)); setSaved(false); }}>Remove</Button>
            </div>)}
            <Button type="button" variant="outline" onClick={() => {
              setPeriods((previous) => {
                const start = previous.at(-1)?.end || "08:00";
                const [hour, minute] = start.split(":").map(Number);
                const end = previous.length ? (hour < 23 ? `${String(hour + 1).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : "23:59") : "12:00";
                return [...previous, { start, end, capacity: NaN }];
              });
              setSaved(false);
            }}>Add Period</Button>
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {saved && <p role="status" className="text-sm text-green-700 dark:text-green-400">Quota saved for this window today.</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={saving || disabled || windowId !== currentWindowId || availability?.date !== date || !availability?.windows.some((window) => window.id === windowId)}>{saving ? "Saving..." : "Save Window Quota"}</Button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
