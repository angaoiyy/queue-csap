import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/offices";

// Layout-level guard for super-admin-only dashboard pages. Server actions and
// RLS enforce the same rule independently; this only decides where a
// non-super-admin gets sent.
export async function SuperAdminGuard({
  children,
}: {
  children: React.ReactNode;
}) {
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
