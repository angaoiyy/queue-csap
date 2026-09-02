import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/offices";
import { LogoutButton } from "@/components/logout-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

async function PendingContent() {
  const profile = await getSessionProfile();
  if (!profile) {
    redirect("/auth/login");
  }
  if (profile.role === "super_admin" || profile.status === "approved") {
    redirect("/dashboard");
  }

  const rejected = profile.status === "rejected";

  return (
    <div className="w-full max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {rejected ? "Account not approved" : "Awaiting approval"}
          </CardTitle>
          <CardDescription>
            {rejected
              ? "Your staff account request was declined."
              : "Your staff account is pending administrator approval."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {rejected
              ? "Contact the system administrator if you believe this is a mistake."
              : "You'll be able to open the dashboard as soon as the administrator approves your account. Please check back later."}
          </p>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}

export default function PendingPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-muted-foreground">Loading…</div>
      }
    >
      <PendingContent />
    </Suspense>
  );
}
