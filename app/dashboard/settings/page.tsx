import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSettingsItems } from "@/lib/actions/settings";
import { SettingsPanel } from "@/components/settings-panel";
import Link from "next/link";
import { Suspense } from "react";

async function SettingsContent() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  const [schoolYears, departments, inquiryTypes, degreePrograms, purposeOptions] =
    await Promise.all([
      listSettingsItems("school_years"),
      listSettingsItems("departments"),
      listSettingsItems("inquiry_types"),
      listSettingsItems("degree_programs"),
      listSettingsItems("purpose_of_request_options"),
    ]);

  return (
    <div className="flex-1 w-full flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage the lists used on the booking form without touching code.
        </p>
      </div>
      <SettingsPanel
        schoolYears={schoolYears}
        departments={departments}
        inquiryTypes={inquiryTypes}
        degreePrograms={degreePrograms}
        purposeOptions={purposeOptions}
      />
      <div className="flex gap-4 text-sm">
        <Link href="/dashboard/admin" className="text-primary hover:underline">
          Admin Panel
        </Link>
        <Link href="/dashboard" className="text-muted-foreground hover:underline">
          Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-12">Loading...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
