import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import {
  printer as ThermalPrinter,
  types as PrinterTypes,
} from "node-thermal-printer";

const execFileAsync = promisify(execFile);

const RAW_PRINT_SCRIPT = path.join(
  process.cwd(),
  "lib",
  "printer",
  "raw-print.ps1",
);
const DEFAULT_PRINTER_NAME = "XP-58 (copy 1)";

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

export type PrintResult = { success: true } | { success: false; error: string };

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

export async function printReservationTicket(
  ticket: TicketData,
): Promise<PrintResult> {
  if (process.platform !== "win32") {
    return {
      success: false,
      error: "Ticket printing is only supported on Windows",
    };
  }

  const printerName =
    process.env.THERMAL_PRINTER_NAME?.trim() || DEFAULT_PRINTER_NAME;
  const tmpFile = path.join(os.tmpdir(), `screenb-ticket-${randomUUID()}.bin`);

  try {
    const buffer = buildTicketBuffer(ticket);
    await writeFile(tmpFile, buffer);

    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      RAW_PRINT_SCRIPT,
      "-PrinterName",
      printerName,
      "-FilePath",
      tmpFile,
    ]);

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}
