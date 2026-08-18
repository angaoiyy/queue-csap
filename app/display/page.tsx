"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDisplayData, type DisplayData } from "@/lib/actions/reservation";
import { parseVideoEmbedUrl } from "@/lib/video";
import { speakNowServing, unlockSpeech } from "@/lib/speech";
import Image from "next/image";

const AUDIO_ENABLED_KEY = "display-audio-enabled";
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
        }),
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
  const [audioEnabled, setAudioEnabled] = useState(false);
  const time = useClock();
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
        if (audioEnabled && data.audioEnabled) speakNowServing(w.queueNumber, w.windowName);
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
  const ticketsByWindow = nowServingByWindow.map((windowData) => ({
    windowId: windowData.windowId,
    windowName: windowData.windowName,
    queueNumber: windowData.queueNumber,
    inquiryType: windowData.inquiryType,
    waitingTickets: assignedTickets.filter(
      (ticket) =>
        ticket.windowName === windowData.windowName &&
        ticket.status === "waiting",
    ),
  }));

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(356,45%,15%)]">
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
      <header className="flex items-center justify-between bg-primary px-8 py-4">
        <div className="flex items-center gap-4">
          <Image
            src="/csap.png"
            alt="CSAP Logo"
            width={56}
            height={56}
            className="object-contain"
          />
          <div>
            <h1 className="text-2xl font-bold text-white">
              CSAP Queue Management System
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
      <main className="flex flex-1 gap-8 px-10 py-8">
        {/* Windows */}
        <section className="flex flex-1 flex-col">
          <div className="rounded-t-2xl bg-primary px-8 py-4">
            <h2 className="text-xl font-bold tracking-wide text-white">
              Live Queue
            </h2>
          </div>
          <div className="flex flex-1 rounded-b-2xl border border-t-0 border-white/15 bg-white/5 p-6 backdrop-blur-sm">
            {ticketsByWindow.length > 0 ? (
              <div
                className="grid flex-1 gap-6"
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
                    className="flex flex-col rounded-xl border border-white/15 bg-black/15 p-5"
                  >
                    <p className="mb-4 text-center text-base font-bold uppercase tracking-widest text-white/90">
                      {windowColumn.windowName}
                    </p>

                    <div className="flex flex-col items-center overflow-hidden rounded-xl border border-secondary/40 bg-secondary/10 px-4 py-8">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-secondary/90">
                        Now Serving
                      </p>
                      <p className="w-full text-center text-[clamp(1.75rem,4vw,4.5rem)] font-black leading-none tracking-wide text-white">
                        {windowColumn.queueNumber ?? "— —"}
                      </p>
                      <p className="mt-3 truncate text-sm text-white/70">
                        {windowColumn.inquiryType ?? "No active ticket"}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-1 flex-col gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                        Waiting
                      </p>
                      {windowColumn.waitingTickets.length > 0 ? (
                        windowColumn.waitingTickets.map((ticket) => (
                          <div
                            key={`${ticket.windowName}-${ticket.queueNumber}`}
                            className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center"
                          >
                            <span className="text-xl font-bold tracking-wide text-white">
                              {ticket.queueNumber}
                            </span>
                          </div>
                        ))
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
          <section className="flex w-[360px] flex-shrink-0 flex-col">
            {/* <div className="rounded-t-2xl bg-primary px-8 py-4">
              {/* <h2 className="text-xl font-bold tracking-wide text-white">
                Now Showing
              </h2> */}
            {/* </div>  */}
            <div className="flex flex-1 flex-col gap-3 overflow-hidden rounded-b-2xl border border-t-0 border-white/15 bg-white/5 p-3 backdrop-blur-sm">
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

              <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Priority Lane
                </p>
                {priorityNext.length > 0 ? (
                  priorityNext.map((ticket, i) => (
                    <div
                      key={ticket.queueNumber}
                      className={`flex flex-col items-center gap-1 rounded-2xl bg-white px-5 py-4 shadow-md ${
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
