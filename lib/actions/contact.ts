"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { requireSuperAdmin } from "@/lib/offices";
import { CONTACT_LIMITS } from "@/lib/constants";

export type ContactMessage = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
};

export type SubmitContactMessageInput = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  message: string;
  // Honeypot: real visitors never see or fill this field.
  website?: string;
};

export type ContactActionResult =
  | { success: true }
  | { success: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s().]+$/;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function submitContactMessage(
  input: SubmitContactMessageInput
): Promise<ContactActionResult> {
  // Bots tend to fill every field. Pretend it worked, store nothing.
  if (clean(input?.website)) {
    return { success: true };
  }

  const firstName = clean(input?.first_name);
  const lastName = clean(input?.last_name);
  const email = clean(input?.email);
  const phone = clean(input?.phone);
  const message = clean(input?.message);

  if (!firstName) return { success: false, error: "First name is required." };
  if (!lastName) return { success: false, error: "Last name is required." };
  if (firstName.length > CONTACT_LIMITS.name || lastName.length > CONTACT_LIMITS.name) {
    return {
      success: false,
      error: `Names must be ${CONTACT_LIMITS.name} characters or fewer.`,
    };
  }

  if (!email && !phone) {
    return { success: false, error: "Enter an email address or a phone number." };
  }
  if (email && (email.length > CONTACT_LIMITS.email || !EMAIL_PATTERN.test(email))) {
    return { success: false, error: "Enter a valid email address." };
  }
  if (phone) {
    const digits = phone.replace(/\D/g, "").length;
    if (
      phone.length > CONTACT_LIMITS.phone ||
      !PHONE_PATTERN.test(phone) ||
      digits < 7 ||
      digits > 15
    ) {
      return { success: false, error: "Enter a valid phone number." };
    }
  }

  if (!message) return { success: false, error: "Please write a message." };
  if (message.length > CONTACT_LIMITS.message) {
    return {
      success: false,
      error: `Message must be ${CONTACT_LIMITS.message} characters or fewer.`,
    };
  }

  const supabase = await createClient();
  // No .select() here: anonymous visitors can insert but have no SELECT policy.
  const { error } = await supabase.from("contact_messages").insert({
    first_name: firstName,
    last_name: lastName,
    email: email || null,
    phone: phone || null,
    message,
  });

  if (error) {
    console.error("submitContactMessage failed", error);
    return {
      success: false,
      error: "We could not send your message. Please try again.",
    };
  }

  return { success: true };
}

export async function listContactMessages(): Promise<ContactMessage[]> {
  noStore();
  await requireSuperAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_messages")
    .select("id, first_name, last_name, email, phone, message, is_read, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []) as ContactMessage[];
}

export async function getUnreadContactCount(): Promise<number> {
  noStore();
  await requireSuperAdmin();

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("contact_messages")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);
  if (error) throw error;

  return count ?? 0;
}

export async function setContactMessageRead(
  id: string,
  isRead: boolean
): Promise<ContactActionResult> {
  await requireSuperAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_messages")
    .update({ is_read: isRead })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Message not found." };

  revalidatePath("/dashboard/messages");
  return { success: true };
}

export async function deleteContactMessage(
  id: string
): Promise<ContactActionResult> {
  await requireSuperAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_messages")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Message not found." };

  revalidatePath("/dashboard/messages");
  return { success: true };
}
