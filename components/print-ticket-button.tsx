"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { printEscPosBase64 } from "@/lib/printer/qz-client";

const PRINTER_NAME_KEY = "screenb_printer_name";
const TICKET_KEY = "screenb_ticket_escpos";

type Status = "idle" | "no-ticket" | "printing" | "success" | "error";

export function PrintTicketButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [printerName, setPrinterName] = useState("");
  const ticketRef = useRef<string | null>(null);
  const autoPrintedRef = useRef(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(TICKET_KEY);
    sessionStorage.removeItem(TICKET_KEY);
    ticketRef.current = stored;
    setPrinterName(localStorage.getItem(PRINTER_NAME_KEY) ?? "");
    if (!stored) setStatus("no-ticket");
  }, []);

  const handlePrint = async (name: string) => {
    const ticket = ticketRef.current;
    if (!ticket || !name.trim()) return;
    setStatus("printing");
    setErrorMsg("");
    try {
      await printEscPosBase64(name.trim(), ticket);
      localStorage.setItem(PRINTER_NAME_KEY, name.trim());
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Print failed. Is QZ Tray running on this PC?",
      );
    }
  };

  useEffect(() => {
    if (autoPrintedRef.current) return;
    if (!ticketRef.current || !printerName.trim()) return;
    autoPrintedRef.current = true;
    handlePrint(printerName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printerName]);

  if (status === "no-ticket") return null;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="grid gap-2">
        <Label htmlFor="printer_name">Printer name (as set up in QZ Tray)</Label>
        <Input
          id="printer_name"
          placeholder="XP-58"
          value={printerName}
          onChange={(e) => setPrinterName(e.target.value)}
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={status === "printing" || !printerName.trim()}
        onClick={() => handlePrint(printerName)}
      >
        {status === "printing" ? "Printing..." : "Print Ticket"}
      </Button>
      {status === "error" && (
        <p className="text-sm text-destructive">{errorMsg}</p>
      )}
      {status === "success" && (
        <p className="text-sm text-green-600">Ticket sent to printer.</p>
      )}
    </div>
  );
}
