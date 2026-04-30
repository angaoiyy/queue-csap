"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDisplayData, type DisplayData } from "@/lib/actions/reservation";
import Image from "next/image";
const INSTITUTION = "Colegio de San Antonio de Padua";
const LOCATION = "Guinsay, Danao City, Philippines";

function useClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const fmt = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-PH", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
    };
    fmt();
    const id = setInterval(fmt, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function DisplayPage() {
  const [data, setData] = useState<DisplayData | null>(null);
  const time = useClock();

  useEffect(() => {
    const load = async () => {
      const d = await getDisplayData();
      setData(d);
    };
    load();
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("reservations-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservations" },
        async () => {
          const d = await getDisplayData();
          setData(d);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(356,45%,15%)]">
        <p className="text-xl text-white/80">Loading...</p>
      </div>
    );
  }

  const nowServingByWindow = data.nowServingByWindow;
  const nextUp = data.next.slice(0, 5);
  const assignedTickets = data.assignedTickets;
  const ticketsByWindow = nowServingByWindow.map((windowData) => ({
    windowId: windowData.windowId,
    windowName: windowData.windowName,
    tickets: assignedTickets.filter((ticket) => ticket.windowName === windowData.windowName),
  }));

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(356,45%,15%)]">
      {/* Header */}
      <header className="flex items-center justify-between bg-primary px-8 py-4">
        <div className="flex items-center gap-4">
         <Image src="/csap.png" alt="CSAP Logo" width={56} height={56} className="object-contain" />
          <div>
            <h1 className="text-2xl font-bold text-white">
              CSAP 
            </h1>
            <p className="text-sm text-white/90">{INSTITUTION}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-white">{time}</p>
          <p className="text-sm text-white/90">Current Time</p>
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col items-center justify-center gap-12 px-8 py-12">
        <div className="grid w-full max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {nowServingByWindow.map((windowData) => (
            <div
              key={windowData.windowId}
              className="flex flex-col items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-8 py-10 backdrop-blur-sm"
            >
              <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-white/80">
                {windowData.windowName}
              </p>
              <p className="mb-1 text-xs uppercase tracking-widest text-white/60">
                Now Serving
              </p>
              <p className="text-5xl font-bold tracking-widest text-white">
                {windowData.queueNumber ?? "— —"}
              </p>
              <p className="mt-2 text-xs text-white/60">
                {windowData.inquiryType ?? "No active ticket"}
              </p>
            </div>
          ))}
        </div>

        <div className="w-full max-w-5xl">
          <div className="rounded-t-xl bg-primary px-6 py-3">
            <h2 className="text-center text-lg font-bold text-white">
              Ticket to Window
            </h2>
          </div>
          <div className="rounded-b-xl border border-t-0 border-white/20 bg-white/5 px-8 py-6 backdrop-blur-sm">
            {ticketsByWindow.length > 0 ? (
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(
                    1,
                    ticketsByWindow.length
                  )}, minmax(0, 1fr))`,
                }}
              >
                {ticketsByWindow.map((windowColumn) => (
                  <div
                    key={windowColumn.windowId}
                    className="rounded-lg border border-white/20 bg-black/10 p-3"
                  >
                    <p className="mb-3 text-center text-sm font-semibold uppercase tracking-wider text-white/85">
                      {windowColumn.windowName}
                    </p>
                    <div className="space-y-2">
                      {windowColumn.tickets.length > 0 ? (
                        windowColumn.tickets.map((ticket) => (
                          <div
                            key={`${ticket.windowName}-${ticket.queueNumber}-${ticket.status}`}
                            className="rounded-md border border-white/20 bg-white/5 px-3 py-2"
                          >
                            <p className="text-2xl font-bold tracking-wide text-white">
                              {ticket.queueNumber}
                            </p>
                            <p className="text-xs text-white/75">
                              {ticket.inquiryType}
                            </p>
                            <p className="text-[11px] font-medium uppercase tracking-wide text-white/60">
                              {ticket.status === "serving" ? "Now Serving" : "Waiting"}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-md border border-dashed border-white/20 px-3 py-4 text-center text-xs text-white/55">
                          No assigned tickets
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-lg text-white/60">
                No called tickets yet
              </p>
            )}
          </div>
        </div>

        {/* Recently Called / Up Next */}
        <div className="w-full max-w-4xl">
          <div className="rounded-t-xl bg-primary px-6 py-3">
            <h2 className="text-center text-lg font-bold text-white">
              Up Next
            </h2>
          </div>
          <div className="rounded-b-xl border border-t-0 border-white/20 bg-white/5 px-8 py-8 backdrop-blur-sm">
            {nextUp.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-4">
                {nextUp.map((num) => (
                  <span
                    key={num}
                    className="rounded-lg border border-secondary/50 bg-secondary/10 px-6 py-3 text-2xl font-semibold text-secondary"
                  >
                    {num}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-center text-lg text-white/60">
                No numbers in queue
              </p>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-primary px-8 py-4 text-center">
        <p className="text-sm text-white/95">
          Please proceed to your assigned counter when your number is called
        </p>
        <p className="mt-1 text-xs text-white/70">{LOCATION}</p>
      </footer>
    </div>
  );
}
