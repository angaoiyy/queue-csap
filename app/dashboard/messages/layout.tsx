import { Suspense } from "react";
import { SuperAdminGuard } from "@/components/super-admin-guard";

export default function MessagesLayout({
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
