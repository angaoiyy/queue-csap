export type QuotaPeriod = { start: string; end: string; capacity: number };

export type WindowQuota = {
  id: string;
  name: string;
  enabled: boolean;
  periods: QuotaPeriod[];
  capacity: number | null;
  activeCount: number;
  nextStart: string | null;
};

export type QuotaAvailability = { date: string; windows: WindowQuota[] };

export function quotaStatus(window: WindowQuota) {
  if (window.capacity === null) return "unlimited";
  if (window.capacity === 0) return "closed";
  return window.activeCount < window.capacity ? "available" : "full";
}

export function canReserve(availability: QuotaAvailability) {
  return availability.windows.some((window) =>
    ["unlimited", "available"].includes(quotaStatus(window)),
  );
}

export function availabilityMessage(availability: QuotaAvailability) {
  if (!availability.windows.length) return "No service windows are open for reservations.";
  if (canReserve(availability)) return null;
  const full = availability.windows.some((window) => quotaStatus(window) === "full");
  const nextStart = availability.windows
    .map((window) => window.nextStart)
    .filter((start): start is string => start !== null)
    .sort()[0];
  const message = full
    ? "All available windows are full. Please try again as tickets are completed."
    : "Reservations are closed outside today's configured periods.";
  return nextStart ? `${message} The next period starts at ${formatQuotaTime(nextStart)} (Philippine time).` : message;
}

export function formatQuotaTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

export function validateQuotaPeriods(enabled: boolean, periods: QuotaPeriod[]): string | null {
  if (!Array.isArray(periods)) return "Invalid time periods.";
  if (enabled && !periods.length) return "Add at least one time period before enabling quotas.";
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  const sorted = [...periods].sort((a, b) => String(a?.start).localeCompare(String(b?.start)));
  let previousEnd = "";
  for (const period of sorted) {
    if (!period || !timePattern.test(period.start) || !timePattern.test(period.end) || period.start >= period.end) {
      return "Enter a valid start and end time on the same day. End must be after start.";
    }
    if (!Number.isInteger(period.capacity) || period.capacity < 1 || period.capacity > 2147483647) {
      return "Each quota must be a positive whole number no larger than 2,147,483,647.";
    }
    if (period.start < previousEnd) return "Time periods cannot overlap.";
    previousEnd = period.end;
  }
  return null;
}
