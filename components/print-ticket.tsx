"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isKioskMode } from "@/lib/kiosk-mode";
import {
  renderTicketImage,
  TICKET_WIDTH_MM,
  type TicketImage,
  type TicketImageData,
} from "@/lib/printer/ticket-image";

type PrintTicketProps = TicketImageData & {
  ticketKey: string;
};

const PRINTED_KEY_PREFIX = "screenb-ticket-printed:";

// The page is sized to the ticket itself so the printer stops feeding paper
// right after the last line instead of running out the driver's long roll size.
function ticketCss(heightMm: number) {
  return `
.print-ticket { display: none; }
@media print {
  @page { size: ${TICKET_WIDTH_MM}mm ${heightMm}mm; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body > :not(.print-ticket) { display: none !important; }
  .print-ticket { display: block; }
  .print-ticket img {
    display: block;
    width: ${TICKET_WIDTH_MM}mm;
    height: ${heightMm}mm;
    image-rendering: pixelated;
  }
}
`;
}

export function PrintTicket({
  ticketKey,
  queueNumber,
  studentName,
  claimOrRequest,
  windowName,
}: PrintTicketProps) {
  const [ticket, setTicket] = useState<TicketImage | null>(null);

  useEffect(() => {
    let cancelled = false;
    const rendered = renderTicketImage({
      queueNumber,
      studentName,
      claimOrRequest,
      windowName,
    });
    // Decode before rendering so the bitmap is ready when print() snapshots the page.
    const img = new Image();
    img.src = rendered.url;
    img
      .decode()
      .catch(() => {})
      .then(() => {
        if (!cancelled) setTicket(rendered);
      });
    return () => {
      cancelled = true;
    };
  }, [queueNumber, studentName, claimOrRequest, windowName]);

  useEffect(() => {
    if (!ticket || !isKioskMode()) return;

    // Guard against reprinting on refresh, back/forward, or Strict Mode re-runs.
    const storageKey = PRINTED_KEY_PREFIX + ticketKey;
    try {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // Storage unavailable: still print once for this mount.
    }
    window.print();
  }, [ticket, ticketKey]);

  if (!ticket) return null;

  return createPortal(
    <div className="print-ticket" aria-hidden="true">
      <style>{ticketCss(ticket.heightMm)}</style>
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL bitmap */}
      <img src={ticket.url} alt="" />
    </div>,
    document.body,
  );
}
