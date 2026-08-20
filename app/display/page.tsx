"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDisplayData, type DisplayData } from "@/lib/actions/reservation";
import { parseVideoEmbedUrl } from "@/lib/video";
import { speakNowServing, unlockSpeech } from "@/lib/speech";
import Image from "next/image";

const AUDIO_ENABLED_KEY = "display-audio-enabled";
const INSTITUTION = "Colegio de San Antonio de Padua";

function useClock() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => {
    const fmt = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-PH", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
      );
      setDate(
        now.toLocaleDateString("en-PH", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      );
    };
    fmt();
    const id = setInterval(fmt, 1000);
    return () => clearInterval(id);
  }, []);
  return { time, date };
}

export default function DisplayPage() {
  const [data, setData] = useState<DisplayData | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const { time, date } = useClock();
  const lastServingRef = useRef<Map<string, string>>(new Map());
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    if (sessionStorage.getItem(AUDIO_ENABLED_KEY) === "true") {
      setAudioEnabled(true);
    }
  }, []);

  const enableAudio = () => {
    unlockSpeech();
    sessionStorage.setItem(AUDIO_ENABLED_KEY, "true");
    setAudioEnabled(true);
  };

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
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "display_settings" },
        async () => {
          const d = await getDisplayData();
          setData(d);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!data) return;

    const lastServing = lastServingRef.current;

    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      for (const w of data.nowServingByWindow) {
        if (w.queueNumber) lastServing.set(w.windowId, w.queueNumber);
      }
      return;
    }

    for (const w of data.nowServingByWindow) {
      const previous = lastServing.get(w.windowId);
      if (w.queueNumber && w.queueNumber !== previous) {
        if (audioEnabled && data.audioEnabled)
          speakNowServing(w.queueNumber, w.windowName, w.studentName);
        lastServing.set(w.windowId, w.queueNumber);
      } else if (!w.queueNumber) {
        lastServing.delete(w.windowId);
      }
    }
  }, [data, audioEnabled]);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(356,45%,15%)]">
        <p className="text-xl text-white/80">Loading...</p>
      </div>
    );
  }

  const nowServingByWindow = data.nowServingByWindow;
  const videoEmbedUrl = data.videoUrl
    ? parseVideoEmbedUrl(data.videoUrl)
    : null;
  const showVideoSection = data.videoEnabled;
  const priorityNext = data.priorityNext;
  const assignedTickets = data.assignedTickets;
  const skippedTickets = data.skippedTickets;
  const ticketsByWindow = nowServingByWindow.map((windowData) => ({
    windowId: windowData.windowId,
    windowName: windowData.windowName,
    queueNumber: windowData.queueNumber,
    inquiryType: windowData.inquiryType,
    studentName: windowData.studentName,
    waitingTickets: assignedTickets.filter(
      (ticket) =>
        ticket.windowName === windowData.windowName &&
        ticket.status === "waiting",
    ),
  }));

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[hsl(356,45%,15%)]">
      {!audioEnabled && data.audioEnabled && (
        <button
          type="button"
          onClick={enableAudio}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 text-white backdrop-blur-sm"
        >
          <p className="text-2xl font-bold">Tap to enable sound</p>
          <p className="text-sm text-white/70">
            Numbers called will be announced aloud
          </p>
        </button>
      )}
      {/* Header */}
      <header className="flex flex-shrink-0 items-center justify-between bg-primary px-8 py-3">
        <div className="flex items-center gap-4">
          <Image
            src="/csap.png"
            alt="CSAP Logo"
            width={48}
            height={48}
            className="object-contain"
          />
          <div>
            <h1 className="text-xl font-bold text-white">
              CSAP Queue Management System
            </h1>
            <p className="text-xs text-white/90">{INSTITUTION}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white">{time}</p>
          <p className="text-xs text-white/90">{date}</p>
        </div>
      </header>

      {/* Main content */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 px-10 py-4">
      <div className="flex min-h-0 flex-1 gap-6">
        {/* Windows */}
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex-shrink-0 rounded-t-2xl bg-primary px-8 py-3">
            <h2 className="text-lg font-bold tracking-wide text-white">
              Live Queue
            </h2>
          </div>
          <div className="flex min-h-0 flex-1 rounded-b-2xl border border-t-0 border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            {ticketsByWindow.length > 0 ? (
              <div
                className="grid flex-1 gap-4"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(
                    1,
                    ticketsByWindow.length,
                  )}, minmax(0, 1fr))`,
                }}
              >
                {ticketsByWindow.map((windowColumn) => (
                  <div
                    key={windowColumn.windowId}
                    className="flex min-h-0 flex-col rounded-xl border border-white/15 bg-black/15 p-4"
                  >
                    <p className="mb-3 text-center text-base font-bold uppercase tracking-widest text-white/90">
                      {windowColumn.windowName}
                    </p>

                    <div className="flex flex-shrink-0 flex-col items-center overflow-hidden rounded-xl border border-secondary/40 bg-secondary/10 px-4 py-4 [container-type:inline-size]">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-secondary/90">
                        Now Serving
                      </p>
                      <p className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-[clamp(1.5rem,15cqw,3.75rem)] font-black leading-none tracking-wide text-white">
                        {windowColumn.queueNumber ?? "— —"}
                      </p>
                      {windowColumn.studentName && (
                        <p className="mt-1 w-full truncate text-center text-sm font-semibold text-white/90">
                          {windowColumn.studentName}
                        </p>
                      )}
                      <p className="mt-2 truncate text-sm text-white/70">
                        {windowColumn.inquiryType ?? "No active ticket"}
                      </p>
                    </div>

                    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
                      <p className="flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-white/50">
                        Waiting
                      </p>
                      {windowColumn.waitingTickets.length > 0 ? (
                        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                          {windowColumn.waitingTickets.map((ticket) => (
                            <div
                              key={`${ticket.windowName}-${ticket.queueNumber}`}
                              className="flex-shrink-0 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-center"
                            >
                              <span className="text-xl font-bold tracking-wide text-white">
                                {ticket.queueNumber}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/15 px-3 py-6 text-center text-xs text-white/45">
                          No waiting tickets
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="m-auto text-center text-lg text-white/60">
                No called tickets yet
              </p>
            )}
          </div>
        </section>

        {/* Now Showing sidebar */}
        {showVideoSection && (
          <section className="flex w-[320px] flex-shrink-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-2xl border border-white/15 bg-white/5 p-3 backdrop-blur-sm">
              {videoEmbedUrl ? (
                <iframe
                  src={videoEmbedUrl}
                  className="aspect-video w-full flex-shrink-0 rounded-xl"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <p className="flex aspect-video w-full flex-shrink-0 items-center justify-center rounded-xl border border-dashed border-white/15 text-center text-lg text-white/60">
                  No video set
                </p>
              )}

              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-1">
                <p className="flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-white/50">
                  Priority Lane
                </p>
                {priorityNext.length > 0 ? (
                  priorityNext.map((ticket, i) => (
                    <div
                      key={ticket.queueNumber}
                      className={`flex flex-shrink-0 flex-col items-center gap-1 rounded-2xl bg-white px-5 py-3 shadow-md ${
                        i === 0 ? "ring-2 ring-secondary" : ""
                      }`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-primary/70">
                        {ticket.windowName}
                      </p>
                      <p className="text-4xl font-black tracking-wide text-primary">
                        {ticket.queueNumber}
                      </p>
                      <div className="my-1 h-px w-10 bg-primary/30" />
                      <p className="truncate text-sm font-bold text-neutral-800">
                        {ticket.studentName}
                      </p>
                      <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                        {ticket.inquiryType}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="m-auto text-center text-sm text-white/45">
                    No priority numbers in queue
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

        {/* Skipped Numbers */}
        <section className="flex flex-shrink-0 flex-col">
          <div className="flex items-center gap-3 rounded-2xl bg-primary px-6 py-2">
            <h2 className="flex-shrink-0 text-sm font-bold tracking-wide text-white">
              Skipped Numbers
            </h2>
            <div className="flex flex-1 gap-2 overflow-x-auto">
              {skippedTickets.length > 0 ? (
                skippedTickets.map((ticket) => (
                  <div
                    key={`${ticket.windowName}-${ticket.queueNumber}`}
                    className="flex flex-shrink-0 items-baseline gap-1.5 rounded-md border border-white/15 bg-white/10 px-3 py-1"
                  >
                    <span className="text-sm font-bold tracking-wide text-white">
                      {ticket.queueNumber}
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-white/60">
                      {ticket.windowName}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-white/45">No skipped numbers</p>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 bg-primary px-8 py-3 text-center">
        <div className="overflow-hidden whitespace-nowrap">
          <div className="inline-flex animate-marquee">
            <span className="px-8 text-xl font-semibold text-white/95">
              {data.marqueeText}
            </span>
            <span className="px-8 text-xl font-semibold text-white/95" aria-hidden="true">
              {data.marqueeText}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
