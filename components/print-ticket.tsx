"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isKioskMode } from "@/lib/kiosk-mode";

type PrintTicketProps = {
  ticketKey: string;
  queueNumber: string;
  studentName: string;
  claimOrRequest: string;
  windowName: string;
};

const PRINTED_KEY_PREFIX = "screenb-ticket-printed:";

// Mirrors the ESC/POS layout in lib/printer/ticket.ts on a 58mm XP-58/X58:
// 384 printable dots (48mm) = 32 Font A chars, each 12x24 dots (1.5mm x 3mm).
const CHARS_PER_LINE_NORMAL = 32;
const DOT_ROW_MM = 3;

// node-thermal-printer's setTextSize(4, w) emits GS ! with 4 in the width
// nibble, so the number prints 5x wide and (w + 1)x tall.
function heightMultiplierFor(text: string) {
  return (
    Math.max(
      0,
      Math.min(3, Math.floor(CHARS_PER_LINE_NORMAL / text.length) - 1),
    ) + 1
  );
}

const ticketCss = `
.print-ticket { display: none; }
@media print {
  @page { margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body > :not(.print-ticket) { display: none !important; }
  .print-ticket {
    display: block;
    box-sizing: border-box;
    width: 58mm;
    padding: 0 5mm ${DOT_ROW_MM}mm;
    color: #000;
    background: #fff;
    font-family: Consolas, "Courier New", monospace;
    font-size: 2.7mm;
    line-height: ${DOT_ROW_MM}mm;
  }
  .print-ticket p { margin: 0; overflow-wrap: anywhere; }
  .print-ticket .center { text-align: center; }
  .print-ticket .bold { font-weight: 700; }
  .print-ticket .rule { white-space: pre; overflow: hidden; }
  .print-ticket .number { font-size: 13.6mm; font-weight: 700; text-align: center; white-space: nowrap; }
  .print-ticket .number span { display: inline-block; transform-origin: center; }
}
`;

export function PrintTicket({
  ticketKey,
  queueNumber,
  studentName,
  claimOrRequest,
  windowName,
}: PrintTicketProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !isKioskMode()) return;

    // Guard against reprinting on refresh, back/forward, or Strict Mode re-runs.
    const storageKey = PRINTED_KEY_PREFIX + ticketKey;
    try {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // Storage unavailable: still print once for this mount.
    }
    window.print();
  }, [mounted, ticketKey]);

  if (!mounted) return null;

  const match = queueNumber.match(/^([A-Za-z]+)(\d+)$/);
  const numberLines = match ? [match[1], match[2]] : [queueNumber];
  const rule = "-".repeat(CHARS_PER_LINE_NORMAL);

  return createPortal(
    <div className="print-ticket" aria-hidden="true">
      <style>{ticketCss}</style>
      <p className="center bold">CSAP QUEUE TICKET</p>
      <p className="rule">{rule}</p>
      {numberLines.map((line, i) => {
        const height = heightMultiplierFor(line);
        return (
          <p
            key={i}
            className="number"
            style={{ lineHeight: `${height * DOT_ROW_MM}mm` }}
          >
            <span style={{ transform: `scaleY(${height / 4})` }}>{line}</span>
          </p>
        );
      })}
      <p>Name: {studentName}</p>
      {claimOrRequest && <p>Transaction: {claimOrRequest}</p>}
      <p>Window: {windowName || "To be announced"}</p>
      <p className="rule">{rule}</p>
      <p className="center">Please wait for your number to be called.</p>
    </div>,
    document.body,
  );
}
