import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/offices";

async function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const profile = await getSessionProfile();
  if (!profile) {
    redirect("/auth/login");
  }
  if (profile.role !== "super_admin") {
    if (profile.status !== "approved" || !profile.office) {
      redirect("/auth/pending");
    }
    redirect(`/dashboard/${profile.office.slug}/admin`);
  }
  return <>{children}</>;
}

export default function StaffApprovalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12">Loading...</div>
      }
    >
      <SuperAdminGuard>{children}</SuperAdminGuard>
    </Suspense>
  );
}
