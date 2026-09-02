import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getOfficeBySlug, getSessionProfile } from "@/lib/offices";

async function OfficeGuard({
  params,
  children,
}: {
  params: Promise<{ office: string }>;
  children: React.ReactNode;
}) {
  const { office } = await params;

  const found = await getOfficeBySlug(office);
  if (!found) {
    notFound();
  }

  const profile = await getSessionProfile();
  if (!profile) {
    redirect("/auth/login");
  }
  // Staff must be approved by the super admin before they can open any office
  // dashboard. The super admin is exempt.
  if (profile.role !== "super_admin" && profile.status !== "approved") {
    redirect("/auth/pending");
  }
  if (!profile.office) {
    redirect("/auth/pending");
  }
  if (profile.office.slug !== office) {
    redirect(`/dashboard/${profile.office.slug}/admin`);
  }

  return <>{children}</>;
}

export default function DashboardOfficeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ office: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12">Loading...</div>
      }
    >
      <OfficeGuard params={params}>{children}</OfficeGuard>
    </Suspense>
  );
}
