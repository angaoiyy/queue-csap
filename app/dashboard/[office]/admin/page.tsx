import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminQueuePanel } from "@/components/admin-queue-panel";
import { getOfficeBySlug } from "@/lib/offices";
import Link from "next/link";
import { Suspense } from "react";

async function AdminContent({
  params,
}: {
  params: Promise<{ office: string }>;
}) {
  const { office: officeSlug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  const office = await getOfficeBySlug(officeSlug);
  if (!office) notFound();

  const firstName = getFirstNameFromClaims(data.claims);
  const timeOfDayGreeting = getTimeOfDayGreeting();
  const formattedDateTime = getFormattedDateTime();

  return (
    <div className="flex-1 w-full flex flex-col gap-12">
      <div>
        <h1 className="text-2xl font-bold">
          {timeOfDayGreeting}, {firstName}!
        </h1>
        <p className="text-muted-foreground">
          {office.label} • {formattedDateTime}
        </p>
      </div>
      <AdminQueuePanel officeSlug={office.slug} officeId={office.id} />
      <div className="flex gap-4 text-sm">
        <Link
          href={`/${office.slug}/display`}
          className="text-primary hover:underline"
        >
          View Display Screen
        </Link>
        <Link
          href={`/dashboard/${office.slug}/settings`}
          className="text-muted-foreground hover:underline"
        >
          Settings
        </Link>
        <Link
          href={`/dashboard/${office.slug}/activity-logs`}
          className="text-muted-foreground hover:underline"
        >
          Activity Logs
        </Link>
      </div>
    </div>
  );
}

export default function AdminPage({
  params,
}: {
  params: Promise<{ office: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-12">Loading...</div>}>
      <AdminContent params={params} />
    </Suspense>
  );
}

function getFirstNameFromClaims(claims: Record<string, unknown>): string {
  const fullName =
    String(claims.given_name ?? "").trim() ||
    String(claims.name ?? "").trim() ||
    String(claims.full_name ?? "").trim();
  if (fullName) return fullName.split(/\s+/)[0];

  const email = String(claims.email ?? "").trim();
  if (email.includes("@")) return email.split("@")[0];

  return "User";
}

function getTimeOfDayGreeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Manila",
    }).format(new Date())
  );

  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

function getFormattedDateTime(): string {
  const now = new Date();
  const dayDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  }).format(now);

  return `${dayDate}, ${time}`;
}
