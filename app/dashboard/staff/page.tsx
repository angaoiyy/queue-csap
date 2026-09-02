import { Suspense } from "react";
import { listStaffProfiles } from "@/lib/actions/staff";
import { StaffApprovals } from "@/components/staff-approvals";

async function StaffContent() {
  const staff = await listStaffProfiles();

  return (
    <div className="flex-1 w-full flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Staff Approvals</h1>
        <p className="text-muted-foreground">
          Approve or decline staff accounts. Only approved staff can sign in to
          their office dashboard.
        </p>
      </div>
      <StaffApprovals initialStaff={staff} />
    </div>
  );
}

export default function StaffApprovalsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12">Loading...</div>
      }
    >
      <StaffContent />
    </Suspense>
  );
}
