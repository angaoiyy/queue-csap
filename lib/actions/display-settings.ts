"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { parseVideoEmbedUrl } from "@/lib/video";
import { resolveOfficeId } from "@/lib/offices";

export type DisplaySettingsActionResult =
  | { success: true }
  | { success: false; error: string };

export type DisplaySettings = {
  officeId: string;
  videoUrl: string | null;
  isEnabled: boolean;
  audioEnabled: boolean;
  marqueeText: string;
  lunchBreakEnabled: boolean;
  /** 24-hour "HH:MM" */
  lunchBreakStart: string;
  /** 24-hour "HH:MM" */
  lunchBreakEnd: string;
};

const DEFAULT_MARQUEE_TEXT =
  "Please proceed to your assigned counter when your number is called";
const DEFAULT_LUNCH_BREAK_START = "12:00";
const DEFAULT_LUNCH_BREAK_END = "13:00";
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function getDisplaySettings(
  officeId: string
): Promise<DisplaySettings> {
  noStore();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("display_settings")
    .select(
      "office_id, video_url, is_enabled, audio_enabled, marquee_text, lunch_break_enabled, lunch_break_start, lunch_break_end"
    )
    .eq("office_id", officeId)
    .maybeSingle();

  if (error) throw error;
  return {
    officeId,
    videoUrl: data?.video_url ?? null,
    isEnabled: data?.is_enabled ?? true,
    audioEnabled: data?.audio_enabled ?? true,
    marqueeText: data?.marquee_text ?? DEFAULT_MARQUEE_TEXT,
    lunchBreakEnabled: data?.lunch_break_enabled ?? true,
    // Postgres returns time as "HH:MM:SS"
    lunchBreakStart: (
      data?.lunch_break_start ?? DEFAULT_LUNCH_BREAK_START
    ).slice(0, 5),
    lunchBreakEnd: (data?.lunch_break_end ?? DEFAULT_LUNCH_BREAK_END).slice(
      0,
      5
    ),
  };
}

async function updateDisplaySettings(
  officeSlug: string,
  patch: Record<string, unknown>
): Promise<DisplaySettingsActionResult> {
  const officeId = await resolveOfficeId(officeSlug);
  const supabase = await createClient();
  const { error } = await supabase
    .from("display_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("office_id", officeId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/${officeSlug}/display`);
  revalidatePath(`/dashboard/${officeSlug}/admin`);
  revalidatePath(`/dashboard/${officeSlug}/settings`);
  return { success: true };
}

export async function setDisplayMarqueeText(
  officeSlug: string,
  text: string
): Promise<DisplaySettingsActionResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { success: false, error: "Marquee text cannot be empty." };
  }
  return updateDisplaySettings(officeSlug, { marquee_text: trimmed });
}

export async function setDisplayVideoUrl(
  officeSlug: string,
  url: string
): Promise<DisplaySettingsActionResult> {
  const trimmed = url.trim();
  if (trimmed && !parseVideoEmbedUrl(trimmed)) {
    return {
      success: false,
      error: "Unrecognized video link. Paste a YouTube or Vimeo share link.",
    };
  }
  return updateDisplaySettings(officeSlug, { video_url: trimmed || null });
}

export async function setDisplayVideoEnabled(
  officeSlug: string,
  enabled: boolean
): Promise<DisplaySettingsActionResult> {
  return updateDisplaySettings(officeSlug, { is_enabled: enabled });
}

export async function setDisplayAudioEnabled(
  officeSlug: string,
  enabled: boolean
): Promise<DisplaySettingsActionResult> {
  return updateDisplaySettings(officeSlug, { audio_enabled: enabled });
}

export async function setDisplayLunchBreak(
  officeSlug: string,
  enabled: boolean,
  start: string,
  end: string
): Promise<DisplaySettingsActionResult> {
  if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) {
    return { success: false, error: "Enter a valid start and end time." };
  }
  if (start >= end) {
    return { success: false, error: "End time must be after start time." };
  }
  return updateDisplaySettings(officeSlug, {
    lunch_break_enabled: enabled,
    lunch_break_start: start,
    lunch_break_end: end,
  });
}
