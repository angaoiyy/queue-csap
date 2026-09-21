"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Mail, MapPin, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  submitContactMessage,
  type SubmitContactMessageInput,
} from "@/lib/actions/contact";
import { CONTACT_INFO, CONTACT_LIMITS } from "@/lib/constants";

const EMPTY_FORM: SubmitContactMessageInput = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  message: "",
  website: "",
};

const INFO_ROWS = [
  {
    icon: Phone,
    label: "Phone Number",
    value: CONTACT_INFO.phone,
    href: `tel:${CONTACT_INFO.phone.replace(/[^\d+]/g, "")}`,
  },
  {
    icon: Mail,
    label: "Email",
    value: CONTACT_INFO.email,
    href: `mailto:${CONTACT_INFO.email}`,
  },
  {
    icon: MapPin,
    label: "Address",
    value: CONTACT_INFO.address,
    href: null,
  },
] as const;

export function ContactSection() {
  const [form, setForm] = useState<SubmitContactMessageInput>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const update =
    (field: keyof SubmitContactMessageInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setSent(false);
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setSent(false);
    setIsSubmitting(true);
    try {
      const result = await submitContactMessage(form);
      if (result.success) {
        setForm(EMPTY_FORM);
        setSent(true);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      id="contact"
      className="w-full flex justify-center border-t border-t-foreground/10 bg-card py-14 md:py-20 scroll-mt-16"
    >
      <div className="grid w-full max-w-5xl gap-12 px-5 md:grid-cols-2 md:gap-16 md:px-6">
        <div className="flex flex-col gap-8">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold leading-tight md:text-3xl">
              Need more information?
              <br />
              Get in touch with us
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Questions about reservations, requests, or our offices? Send us a
              message and we&apos;ll get back to you.
            </p>
          </div>

          <ul className="flex flex-col gap-6">
            {INFO_ROWS.map(({ icon: Icon, label, value, href }) => (
              <li key={label} className="flex items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">{label}</p>
                  {href ? (
                    <a
                      href={href}
                      className="break-words text-muted-foreground hover:text-primary hover:underline"
                    >
                      {value}
                    </a>
                  ) : (
                    <p className="text-muted-foreground">{value}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold md:text-3xl">Send Message</h2>
            <p className="text-sm text-muted-foreground">
              Please fill out the form below with your details and message to
              contact us.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="relative flex flex-col gap-4">
            {sent && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <p>Message sent. Thank you, we&apos;ll be in touch.</p>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="contact-first-name">First Name</Label>
                <Input
                  id="contact-first-name"
                  name="first_name"
                  autoComplete="given-name"
                  placeholder="First Name"
                  required
                  maxLength={CONTACT_LIMITS.name}
                  value={form.first_name}
                  onChange={update("first_name")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contact-last-name">Last Name</Label>
                <Input
                  id="contact-last-name"
                  name="last_name"
                  autoComplete="family-name"
                  placeholder="Last Name"
                  required
                  maxLength={CONTACT_LIMITS.name}
                  value={form.last_name}
                  onChange={update("last_name")}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  maxLength={CONTACT_LIMITS.email}
                  value={form.email}
                  onChange={update("email")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input
                  id="contact-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+63 900 000 0000"
                  maxLength={CONTACT_LIMITS.phone}
                  value={form.phone}
                  onChange={update("phone")}
                />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              Provide an email or a phone number so we can reach you.
            </p>

            <div className="grid gap-2">
              <Label htmlFor="contact-message">Message</Label>
              <Textarea
                id="contact-message"
                name="message"
                placeholder="Write Message Here..."
                required
                rows={6}
                maxLength={CONTACT_LIMITS.message}
                value={form.message}
                onChange={update("message")}
              />
              <p className="text-right text-xs text-muted-foreground">
                {form.message.length}/{CONTACT_LIMITS.message}
              </p>
            </div>

            {/* Honeypot: hidden from people, tempting to bots. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden"
            >
              <label htmlFor="contact-website">Website</label>
              <input
                id="contact-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={update("website")}
              />
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="w-full sm:w-fit"
            >
              {isSubmitting ? "Sending…" : "Send Message"}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
