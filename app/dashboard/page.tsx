import { Suspense } from "react";
import { DashboardRedirect } from "@/components/dashboard-redirect";

export default function DashboardIndexPage() {
  return (
    <Suspense fallback={null}>
      <DashboardRedirect sub="admin" />
    </Suspense>
  );
}
