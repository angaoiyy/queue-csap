import path from "node:path";
import os from "node:os";
import {
  printer as ThermalPrinter,
  types as PrinterTypes,
} from "node-thermal-printer";

export type TicketData = {
  queueNumber: string;
  studentName: string;
  studentId: string;
  department: string;
  inquiryType: string;
  windowName: string;
  position: number;
  estimatedMinutes: number;
  createdAt: Date;
};

function buildTicketBuffer(ticket: TicketData): Buffer {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    // Unused for buffer generation — no execute() call, no network/serial connection is opened.
    interface: path.join(os.tmpdir(), "screenb-ticket-unused.bin"),
  });

  const dateLabel = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(ticket.createdAt);

  // LAYOUT SA RESIBO

  printer.alignCenter();
  printer.bold(true);
  printer.println("CSAP QUEUE TICKET");
  printer.bold(false);
  printer.drawLine();

  printer.setTextDoubleHeight();
  printer.bold(true);
  printer.println(ticket.queueNumber);
  printer.bold(false);
  printer.setTextNormal();
  // printer.drawLine();

  printer.alignLeft();
  printer.println(`Name: ${ticket.studentName}`);
  // printer.println(`Student ID: ${ticket.studentId}`);
  // printer.println(`Department: ${ticket.department}`);
  // printer.println(`Inquiry Type: ${ticket.inquiryType}`);
  printer.println(`Window: ${ticket.windowName || "To be announced"}`);
  // printer.println(`Position in line: ${ticket.position}`);
  // printer.println(`Estimated wait: ~${ticket.estimatedMinutes} min`);
  // printer.println(`Date: ${dateLabel}`);

  printer.drawLine();
  printer.alignCenter();
  printer.println("Please wait for your number to be called.");
  printer.cut();

  return printer.getBuffer();
}

/**
 * Builds the ESC/POS ticket and returns it base64-encoded so it can be sent
 * to the browser, which forwards it to a locally running QZ Tray instance
 * for printing. The server never talks to the printer directly.
 */
export function buildTicketEscPosBase64(ticket: TicketData): string {
  return buildTicketBuffer(ticket).toString("base64");
}
