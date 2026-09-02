import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ActivityLogsTable } from "@/components/activity-logs-table";
import { getOfficeBySlug } from "@/lib/offices";
import { Suspense } from "react";

async function ActivityLogsContent({
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

  return (
    <div className="flex-1 w-full flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Logs</h1>
        <p className="text-muted-foreground">
          {office.label} — reservation and queue operations from staff actions.
        </p>
      </div>
      <ActivityLogsTable officeSlug={office.slug} officeId={office.id} />
    </div>
  );
}

export default function ActivityLogsPage({
  params,
}: {
  params: Promise<{ office: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-12">Loading...</div>}>
      <ActivityLogsContent params={params} />
    </Suspense>
  );
}
