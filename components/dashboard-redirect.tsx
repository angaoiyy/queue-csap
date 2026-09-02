import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/offices";

type Sub = "admin" | "settings" | "activity-logs";

export async function DashboardRedirect({ sub }: { sub: Sub }) {
  const profile = await getSessionProfile();
  if (!profile) {
    redirect("/auth/login");
  }
  if (profile.role === "super_admin") {
    redirect("/dashboard/staff");
  }
  if (profile.status !== "approved") {
    redirect("/auth/pending");
  }
  if (!profile.office) {
    redirect("/auth/pending");
  }
  redirect(`/dashboard/${profile.office.slug}/${sub}`);

  return null;
}
