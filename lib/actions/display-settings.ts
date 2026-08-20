"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { parseVideoEmbedUrl } from "@/lib/video";

export type DisplaySettingsActionResult =
  | { success: true }
  | { success: false; error: string };

export type DisplaySettings = {
  videoUrl: string | null;
  isEnabled: boolean;
  audioEnabled: boolean;
  marqueeText: string;
};

const DEFAULT_MARQUEE_TEXT =
  "Please proceed to your assigned counter when your number is called";

export async function getDisplaySettings(): Promise<DisplaySettings> {
  noStore();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("display_settings")
    .select("video_url, is_enabled, audio_enabled, marquee_text")
    .eq("id", 1)
    .single();

  if (error) throw error;
  return {
    videoUrl: data?.video_url ?? null,
    isEnabled: data?.is_enabled ?? true,
    audioEnabled: data?.audio_enabled ?? true,
    marqueeText: data?.marquee_text ?? DEFAULT_MARQUEE_TEXT,
  };
}

export async function setDisplayMarqueeText(
  text: string
): Promise<DisplaySettingsActionResult> {
  const trimmed = text.trim();

  if (!trimmed) {
    return { success: false, error: "Marquee text cannot be empty." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("display_settings")
    .update({ marquee_text: trimmed, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/display");
  revalidatePath("/dashboard/admin");
  return { success: true };
}

export async function setDisplayVideoUrl(
  url: string
): Promise<DisplaySettingsActionResult> {
  const trimmed = url.trim();

  if (trimmed && !parseVideoEmbedUrl(trimmed)) {
    return {
      success: false,
      error: "Unrecognized video link. Paste a YouTube or Vimeo share link.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("display_settings")
    .update({ video_url: trimmed || null, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/display");
  revalidatePath("/dashboard/admin");
  return { success: true };
}

export async function setDisplayVideoEnabled(
  enabled: boolean
): Promise<DisplaySettingsActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("display_settings")
    .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/display");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function setDisplayAudioEnabled(
  enabled: boolean
): Promise<DisplaySettingsActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("display_settings")
    .update({ audio_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/display");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/settings");
  return { success: true };
}
