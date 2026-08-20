import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdmissionForm } from "@/components/admission-form";
import { ReserveLogoLink } from "@/components/reserve-logo-link";
import { Button } from "@/components/ui/button";
import { listSettingsItems } from "@/lib/actions/settings";

async function AdmissionContent() {
  const [departments, degreePrograms, termsSchoolYear, inquiryTypes] = await Promise.all([
    listSettingsItems("departments", { activeOnly: true }),
    listSettingsItems("degree_programs", { activeOnly: true }),
    listSettingsItems("school_years", { activeOnly: true }),
    listSettingsItems("admission_inquiry_types", { activeOnly: true }),
  ]);

  return (
    <AdmissionForm
      departments={departments}
      degreePrograms={degreePrograms}
      termsSchoolYear={termsSchoolYear}
      inquiryTypes={inquiryTypes}
    />
  );
}

export default function ReserveNewPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-6">
      <Button asChild variant="outline" size="sm" className="absolute left-6 top-6">
        <Link href="/reserve">
          <ArrowLeft className="mr-1 size-4" />
          Back
        </Link>
      </Button>
      <div className="mb-8 text-center flex items-center gap-2 justify-center flex-col">
        <ReserveLogoLink />
      </div>
      <Suspense fallback={<div className="p-12">Loading...</div>}>
        <AdmissionContent />
      </Suspense>
      <div className="mt-8 flex gap-4 text-sm"></div>
    </div>
  );
}
