import { Suspense } from "react";
import { ReservationForm } from "@/components/reservation-form";
import { ReserveLogoLink } from "@/components/reserve-logo-link";
import { listSettingsItems } from "@/lib/actions/settings";

async function ReserveContent() {
  const [departments, degreePrograms, termsSchoolYear, inquiryTypes, purposeOptions] =
    await Promise.all([
      listSettingsItems("departments", { activeOnly: true }),
      listSettingsItems("degree_programs", { activeOnly: true }),
      listSettingsItems("school_years", { activeOnly: true }),
      listSettingsItems("inquiry_types", { activeOnly: true }),
      listSettingsItems("purpose_of_request_options", { activeOnly: true }),
    ]);

  return (
    <ReservationForm
      departments={departments}
      degreePrograms={degreePrograms}
      termsSchoolYear={termsSchoolYear}
      inquiryTypes={inquiryTypes}
      purposeOptions={purposeOptions}
    />
  );
}

export default function ReservePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="mb-8 text-center flex items-center gap-2 justify-center flex-col">
        <ReserveLogoLink />
      </div>
      <Suspense fallback={<div className="p-12">Loading...</div>}>
        <ReserveContent />
      </Suspense>
      <div className="mt-8 flex gap-4 text-sm"></div>
    </div>
  );
}
