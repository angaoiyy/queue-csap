// import { DeployButton } from "@/components/deploy-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/lib/utils";
import { getSessionProfile } from "@/lib/offices";
import { getUnreadContactCount } from "@/lib/actions/contact";
import Link from "next/link";
import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";

// Single approval chokepoint for everything under /dashboard. A staff account
// cannot open any dashboard route until the super admin approves it; the super
// admin is exempt. Route-specific checks (office match, super-admin-only) stay
// in the nested layouts.
async function DashboardGate({ children }: { children: React.ReactNode }) {
  const profile = await getSessionProfile();
  if (!profile) {
    redirect("/auth/login");
  }
  if (profile.role !== "super_admin" && profile.status !== "approved") {
    redirect("/auth/pending");
  }
  return <>{children}</>;
}

async function DashboardNavLinks() {
  const profile = await getSessionProfile();
  const office = profile?.office ?? null;
  const isSuperAdmin = profile?.role === "super_admin";
  const reserveHref = office ? `/${office.slug}/reserve` : "/";
  const displayHref = office ? `/${office.slug}/display` : "/";
  const adminHref = office ? `/dashboard/${office.slug}/admin` : "/dashboard";
  // A missing contact_messages table (migration 029 not applied yet) must not
  // take the whole dashboard nav down.
  const unreadMessages = isSuperAdmin
    ? await getUnreadContactCount().catch(() => 0)
    : 0;

  return (
    <>
      <Link href={adminHref} className="hover:text-primary-foreground">
        Admin
      </Link>
      <Link href={reserveHref} className="hover:text-primary-foreground">
        Reserve
      </Link>
      <Link href={displayHref} className="hover:text-primary-foreground">
        Display
      </Link>
      {isSuperAdmin && (
        <Link
          href="/dashboard/staff"
          className="hover:text-primary-foreground"
        >
          Staff Approvals
        </Link>
      )}
      {isSuperAdmin && (
        <Link
          href="/dashboard/messages"
          className="inline-flex items-center gap-1.5 hover:text-primary-foreground"
        >
          Messages
          {unreadMessages > 0 && (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold leading-none text-secondary-foreground">
              {unreadMessages}
            </span>
          )}
        </Link>
      )}
      {office && (
        <span className="text-primary-foreground/70">{office.label}</span>
      )}
    </>
  );
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16 bg-primary text-primary-foreground">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Image src="/csap.png" alt="CSAP Logo" width={46} height={46} className="object-contain" />
              <Suspense fallback={<span className="text-primary-foreground/50">Loading…</span>}>
                <DashboardNavLinks />
              </Suspense>
            </div>
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </nav>
        <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5">
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-12">
                Loading...
              </div>
            }
          >
            <DashboardGate>{children}</DashboardGate>
          </Suspense>
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 ">
          All rights reserved &copy; 2026 CSAP.
          <ThemeSwitcher />
        </footer>
      </div>
    </main>
  );
}
