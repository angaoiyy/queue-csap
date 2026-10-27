"use client";

import { useCallback, useRef, useState } from "react";
import { getQuotaAvailability } from "@/lib/actions/quotas";
import type { QuotaAvailability } from "@/lib/quotas";
import { usePolling } from "@/lib/use-polling";

export function useQuotaAvailability(officeSlug: string) {
  const [availability, setAvailability] = useState<QuotaAvailability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const next = await getQuotaAvailability(officeSlug);
      if (request === generation.current) { setAvailability(next); setError(null); }
    } catch {
      if (request === generation.current) setError("Could not refresh reservation availability. Please try again.");
    }
  }, [officeSlug]);
  usePolling(refresh, 5000);
  return { availability, error, refresh };
}
