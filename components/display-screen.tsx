"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDisplayData, type DisplayData } from "@/lib/actions/reservation";
import { parseVideoEmbedUrl } from "@/lib/video";
import { canPlayAudio, speakNowServing, unlockSpeech } from "@/lib/speech";
import Image from "next/image";

const INSTITUTION = "Colegio de San Antonio de Padua";

// "HH:MM" (24-hour) -> minutes since midnight
function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// "13:00" -> "1:00 PM"
function formatTimeLabel(time: string) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${period}`;
}

type RecallPayload = {
  queueNumber?: string;
  windowName?: string;
  studentName?: string | null;
};

function useClock() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  // Minutes since midnight, device local time.
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  useEffect(() => {
    const fmt = () => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
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
  return { time, date, nowMinutes };
}

type Props = {
  officeSlug: string;
  officeId: string;
  officeLabel: string;
};

export function DisplayScreen({ officeSlug, officeId, officeLabel }: Props) {
  const [data, setData] = useState<DisplayData | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioChecked, setAudioChecked] = useState(false);
  const { time, date, nowMinutes } = useClock();
  const lastServingRef = useRef<Map<string, string>>(new Map());
  const isFirstLoadRef = useRef(true);
  const audioEnabledRef = useRef(false);
  const audioSettingRef = useRef(false);

  // Enable sound with no tap whenever the browser allows it. Otherwise the
  // very first tap/click/key anywhere on the page unlocks it.
  useEffect(() => {
    let cancelled = false;
    const enable = () => {
      unlockSpeech();
      setAudioEnabled(true);
    };

    canPlayAudio().then((ok) => {
      if (cancelled) return;
      if (ok) enable();
      setAudioChecked(true);
    });

    const events = ["pointerdown", "keydown", "touchstart"] as const;
    const removeListeners = () =>
      events.forEach((e) => window.removeEventListener(e, onGesture));
    const onGesture = () => {
      enable();
      removeListeners();
    };
    events.forEach((e) => window.addEventListener(e, onGesture));

    return () => {
      cancelled = true;
      removeListeners();
    };
  }, []);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    audioSettingRef.current = data?.audioEnabled ?? false;
  }, [data?.audioEnabled]);

  const enableAudio = () => {
    unlockSpeech();
    setAudioEnabled(true);
  };

  useEffect(() => {
    const load = async () => {
      const d = await getDisplayData(officeSlug);
      setData(d);
    };
    load();
  }, [officeSlug]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`reservations-changes-${officeSlug}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservations",
          filter: `office_id=eq.${officeId}`,
        },
        async () => {
          const d = await getDisplayData(officeSlug);
          setData(d);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "display_settings",
          filter: `office_id=eq.${officeId}`,
        },
        async () => {
          const d = await getDisplayData(officeSlug);
          setData(d);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [officeSlug, officeId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`queue-recall-${officeSlug}`)
      .on(
        "broadcast",
        { event: "recall" },
        ({ payload }: { payload: RecallPayload }) => {
          if (!audioEnabledRef.current || !audioSettingRef.current) return;
          if (!payload?.queueNumber || !payload?.windowName) return;
          speakNowServing(
            payload.queueNumber,
            payload.windowName,
            payload.studentName ?? undefined,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [officeSlug]);

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
  const isLunchBreak =
    data.lunchBreakEnabled &&
    nowMinutes !== null &&
    nowMinutes >= toMinutes(data.lunchBreakStart) &&
    nowMinutes < toMinutes(data.lunchBreakEnd);
  // Unmount the video during lunch so it doesn't keep playing under the overlay.
  const showVideoSection = data.videoEnabled && !isLunchBreak;
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
    // Below lg the page scrolls and sections stack; from lg up it is a fixed
    // full-viewport board.
    <div className="flex min-h-dvh flex-col bg-[hsl(356,45%,15%)] lg:h-dvh lg:overflow-hidden">
      {audioChecked && !audioEnabled && data.audioEnabled && (
        <button
          type="button"
          onClick={enableAudio}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center text-white backdrop-blur-sm"
        >
          <p className="text-xl font-bold sm:text-2xl">Tap to enable sound</p>
          <p className="text-sm text-white/70">
            Numbers called will be announced aloud
          </p>
        </button>
      )}
      {/* Header */}
      <header className="flex flex-shrink-0 items-center justify-between gap-3 bg-primary px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Image
            src="/csap.png"
            alt="CSAP Logo"
            width={48}
            height={48}
            className="h-9 w-9 flex-shrink-0 object-contain sm:h-12 sm:w-12"
          />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-white sm:text-xl">
              {officeLabel}
            </h1>
            <p className="truncate text-[11px] text-white/90 sm:text-xs">
              {INSTITUTION}
            </p>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="whitespace-nowrap text-lg font-bold tabular-nums text-white sm:text-2xl">
            {time}
          </p>
          <p className="hidden text-xs text-white/90 sm:block">{date}</p>
        </div>
      </header>

      {/* Main content */}
      <main className="relative flex flex-1 flex-col gap-3 px-3 py-3 sm:px-6 lg:min-h-0 lg:px-10 lg:py-4">
        {isLunchBreak && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[hsl(356,45%,15%)] px-6 text-center sm:gap-6 sm:px-10">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-secondary/90 sm:text-lg">
              We&apos;ll be right back
            </p>
            <h2 className="text-5xl font-black tracking-wide text-white sm:text-7xl lg:text-8xl">
              Lunch Break
            </h2>
            <div className="h-px w-24 bg-white/30" />
            <p className="text-xl font-semibold text-white/90 sm:text-3xl">
              Service resumes at {formatTimeLabel(data.lunchBreakEnd)}
            </p>
            <p className="max-w-2xl text-sm text-white/60 sm:text-lg">
              Your queue number stays valid. Please come back when we
              reopen.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-6">
          {/* Windows */}
          <section className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
            <div className="flex-shrink-0 rounded-t-2xl bg-primary px-4 py-3 sm:px-8">
              <h2 className="text-base font-bold tracking-wide text-white sm:text-lg">
                Live Queue
              </h2>
            </div>
            <div className="flex rounded-b-2xl border border-t-0 border-white/15 bg-white/5 p-2 backdrop-blur-sm sm:p-4 lg:min-h-0 lg:flex-1">
              {ticketsByWindow.length > 0 ? (
                // Columns wrap once a window would get narrower than 220px.
                <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-2 sm:gap-4 lg:min-h-0 lg:auto-rows-[minmax(0,1fr)]">
                  {ticketsByWindow.map((windowColumn) => (
                    <div
                      key={windowColumn.windowId}
                      className="flex min-h-0 min-w-0 flex-col rounded-xl border border-white/15 bg-black/15 p-3 sm:p-4"
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
                          <div className="flex max-h-72 min-h-0 flex-1 flex-col gap-2 overflow-y-auto lg:max-h-none">
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
            <section className="flex w-full flex-shrink-0 flex-col lg:w-[280px] xl:w-[320px]">
              <div className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-white/15 bg-white/5 p-3 backdrop-blur-sm sm:flex-row lg:min-h-0 lg:flex-1 lg:flex-col">
                {videoEmbedUrl ? (
                  <iframe
                    src={videoEmbedUrl}
                    className="aspect-video w-full flex-shrink-0 self-start rounded-xl sm:w-1/2 lg:w-full"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <p className="flex aspect-video w-full flex-shrink-0 items-center justify-center self-start rounded-xl border border-dashed border-white/15 text-center text-lg text-white/60 sm:w-1/2 lg:w-full">
                    No video set
                  </p>
                )}

                <div className="flex max-h-80 min-h-24 min-w-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-1 lg:max-h-none lg:min-h-0">
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
                        <p className="max-w-full truncate text-sm font-bold text-neutral-800">
                          {ticket.studentName}
                        </p>
                        <p className="max-w-full truncate text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
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
          <div className="flex flex-col gap-2 rounded-2xl bg-primary px-4 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-6">
            <h2 className="flex-shrink-0 text-sm font-bold tracking-wide text-white">
              Skipped Numbers
            </h2>
            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
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
      <footer className="flex-shrink-0 bg-primary px-4 py-2 text-center sm:px-8 sm:py-3">
        <div className="overflow-hidden whitespace-nowrap">
          <div className="inline-flex animate-marquee">
            <span className="px-8 text-base font-semibold text-white/95 sm:text-xl">
              {data.marqueeText}
            </span>
            <span
              className="px-8 text-base font-semibold text-white/95 sm:text-xl"
              aria-hidden="true"
            >
              {data.marqueeText}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
