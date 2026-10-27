"use client";

export function ReservationAvailability({ message, retry }: { message: string | null; retry: () => void }) {
  if (!message) return null;
  return <div role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
    <p>{message}</p>
    <button type="button" className="mt-2 underline" onClick={retry}>Refresh availability</button>
  </div>;
}
