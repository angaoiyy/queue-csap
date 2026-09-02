import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSettingsItems } from "@/lib/actions/settings";
import { getDisplaySettings } from "@/lib/actions/display-settings";
import { SettingsPanel } from "@/components/settings-panel";
import { getOfficeBySlug } from "@/lib/offices";
import Link from "next/link";
import { Suspense } from "react";

async function SettingsContent({
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
  const officeId = office.id;

  const [
    schoolYears,
    departments,
    inquiryTypes,
    admissionInquiryTypes,
    degreePrograms,
    purposeOptions,
    displaySettings,
  ] = await Promise.all([
    listSettingsItems("school_years", { officeId }),
    listSettingsItems("departments", { officeId }),
    listSettingsItems("inquiry_types", { officeId }),
    listSettingsItems("admission_inquiry_types", { officeId }),
    listSettingsItems("degree_programs", { officeId }),
    listSettingsItems("purpose_of_request_options", { officeId }),
    getDisplaySettings(officeId),
  ]);

  return (
    <div className="flex-1 w-full flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          {office.label} — manage the lists used on the booking form without touching code.
        </p>
      </div>
      <SettingsPanel
        officeSlug={office.slug}
        officeId={office.id}
        schoolYears={schoolYears}
        departments={departments}
        inquiryTypes={inquiryTypes}
        admissionInquiryTypes={admissionInquiryTypes}
        degreePrograms={degreePrograms}
        purposeOptions={purposeOptions}
        displaySettings={displaySettings}
        requiresClaimRequest={office.requires_claim_request ?? false}
      />
      <div className="flex gap-4 text-sm">
        <Link
          href={`/dashboard/${office.slug}/admin`}
          className="text-primary hover:underline"
        >
          Admin Panel
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

export default function SettingsPage({
  params,
}: {
  params: Promise<{ office: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-12">Loading...</div>}>
      <SettingsContent params={params} />
    </Suspense>
  );
}
