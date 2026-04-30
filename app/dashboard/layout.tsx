// import { DeployButton } from "@/components/deploy-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";
import Image from "next/image";

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
              <Link href={"/reserve"} className="  hover:text-primary-foreground">
                Reserve
              </Link>
              <Link href={"/display"} className="  hover:text-primary-foreground">
                Display
              </Link>
              {/* <Link href={"/dashboard/admin"} className="  hover:text-primary-foreground  ">
                Admin
              </Link> */}
              {/* <div className="flex items-center gap-2">
                <DeployButton />
              </div> */}
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
          {children}
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 ">
          All rights reserved &copy; 2026 CSAP.
          <ThemeSwitcher />
        </footer>
      </div>
    </main>
  );
}
