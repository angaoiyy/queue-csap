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
};

const DEFAULT_MARQUEE_TEXT =
  "Please proceed to your assigned counter when your number is called";

export async function getDisplaySettings(
  officeId: string
): Promise<DisplaySettings> {
  noStore();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("display_settings")
    .select("office_id, video_url, is_enabled, audio_enabled, marquee_text")
    .eq("office_id", officeId)
    .maybeSingle();

  if (error) throw error;
  return {
    officeId,
    videoUrl: data?.video_url ?? null,
    isEnabled: data?.is_enabled ?? true,
    audioEnabled: data?.audio_enabled ?? true,
    marqueeText: data?.marquee_text ?? DEFAULT_MARQUEE_TEXT,
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
