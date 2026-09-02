import { Suspense } from "react";
import { DashboardRedirect } from "@/components/dashboard-redirect";

export default function LegacyActivityLogsPage() {
  return (
    <Suspense fallback={null}>
      <DashboardRedirect sub="activity-logs" />
    </Suspense>
  );
}
