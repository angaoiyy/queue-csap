"use client";

import { useEffect, useRef } from "react";

// Poll only while this page is visible/online and never overlap scheduled reads.
export function usePolling(callback: () => Promise<void>, intervalMs: number, enabled = true, immediate = true) {
  const callbackRef = useRef(callback);
  const running = useRef(false);
  callbackRef.current = callback;
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const run = async () => {
      if (stopped || running.current || document.visibilityState === "hidden" || !navigator.onLine) return;
      running.current = true;
      try { await callbackRef.current(); }
      catch { /* Loaders display their own errors; keep the next poll available. */ }
      finally { running.current = false; }
    };
    if (immediate) void run();
    const timer = setInterval(() => void run(), intervalMs);
    const onVisible = () => { if (document.visibilityState !== "hidden") void run(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [intervalMs, enabled, immediate]);
}
