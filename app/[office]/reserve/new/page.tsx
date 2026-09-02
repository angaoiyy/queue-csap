import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { AdmissionForm } from "@/components/admission-form";
import { ReserveLogoLink } from "@/components/reserve-logo-link";
import { Button } from "@/components/ui/button";
import { listSettingsItems } from "@/lib/actions/settings";
import { getOfficeBySlug } from "@/lib/offices";

async function AdmissionContent({
  params,
}: {
  params: Promise<{ office: string }>;
}) {
  const { office: officeSlug } = await params;
  const office = await getOfficeBySlug(officeSlug);
  if (!office) notFound();
  const officeId = office.id;

  const [departments, degreePrograms, termsSchoolYear, inquiryTypes] = await Promise.all([
    listSettingsItems("departments", { activeOnly: true, officeId }),
    listSettingsItems("degree_programs", { activeOnly: true, officeId }),
    listSettingsItems("school_years", { activeOnly: true, officeId }),
    listSettingsItems("admission_inquiry_types", { activeOnly: true, officeId }),
  ]);

  return (
    <>
      <Button asChild variant="outline" size="sm" className="absolute left-6 top-6">
        <Link href={`/${office.slug}/reserve`}>
          <ArrowLeft className="mr-1 size-4" />
          Back
        </Link>
      </Button>
      <AdmissionForm
        officeSlug={office.slug}
        departments={departments}
        degreePrograms={degreePrograms}
        termsSchoolYear={termsSchoolYear}
        inquiryTypes={inquiryTypes}
        requiresClaimRequest={office.requires_claim_request ?? false}
      />
    </>
  );
}

export default function ReserveNewPage({
  params,
}: {
  params: Promise<{ office: string }>;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-6">
      <div className="mb-8 text-center flex items-center gap-2 justify-center flex-col">
        <ReserveLogoLink />
      </div>
      <Suspense fallback={<div className="p-12">Loading...</div>}>
        <AdmissionContent params={params} />
      </Suspense>
      <div className="mt-8 flex gap-4 text-sm"></div>
    </div>
  );
}
