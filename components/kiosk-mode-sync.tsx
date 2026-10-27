"use client";

import { useEffect } from "react";
import { syncKioskModeFromUrl } from "@/lib/kiosk-mode";

export function KioskModeSync() {
  useEffect(() => {
    syncKioskModeFromUrl();
  }, []);

  return null;
}
