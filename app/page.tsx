// import { DeployButton } from "@/components/deploy-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import HeroSectionDemo from "@/components/ui/hero-section-2-demo";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";
import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Image src="/csap.png" alt="CSAP Logo" width={32} height={32} className="object-contain" />
              <Link href={"/"}>CSAP</Link>
              <Link href={"/reserve"} className="text-muted-foreground hover:text-foreground">
                Reserve
              </Link>
              <Link href={"/display"} className="text-muted-foreground hover:text-foreground">
                Display
              </Link>
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
        <div className="w-full flex justify-center py-8 md:py-10">
          <div className="w-full max-w-6xl px-5 md:px-6">
            <HeroSectionDemo />
          </div>
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
          All rights reserved &copy; 2026 CSAP.
        </footer>
      </div>
    </main>
  );
}
