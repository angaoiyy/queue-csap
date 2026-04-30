import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ActivityLogsTable } from "@/components/activity-logs-table";

export default async function ActivityLogsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 w-full flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Logs</h1>
        <p className="text-muted-foreground">
          Track reservation and queue operations from staff actions.
        </p>
      </div>
      <ActivityLogsTable />
    </div>
  );
}
