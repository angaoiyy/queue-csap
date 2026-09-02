import { Suspense } from "react";
import { DashboardRedirect } from "@/components/dashboard-redirect";

export default function LegacySettingsPage() {
  return (
    <Suspense fallback={null}>
      <DashboardRedirect sub="settings" />
    </Suspense>
  );
}
