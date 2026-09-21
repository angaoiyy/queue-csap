import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { LandingHero } from "@/components/landing-hero";
import { ContactSection } from "@/components/contact-section";
import { hasEnvVars } from "@/lib/utils";
import { getAllOffices } from "@/lib/offices";
import Link from "next/link";
import { Suspense } from "react";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function OfficeGrid() {
  const offices = await getAllOffices();

  if (offices.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        No offices are open for reservations right now.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {offices.map((office) => (
        <Card key={office.slug} className="transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle>{office.label}</CardTitle>
            <CardDescription>
              Reserve a number or open the display.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild size="lg">
              <Link href={`/${office.slug}/reserve`}>Reserve Queue Number</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href={`/${office.slug}/display`}>Display Screen</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Image
                src="/csap.png"
                alt="CSAP Logo"
                width={32}
                height={32}
                className="object-contain"
              />
              <Link href={"/"}> Colegio de San Antonio de Padua</Link>
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

        <LandingHero />

        <section
          id="offices"
          className="w-full flex justify-center py-14 md:py-20 scroll-mt-16"
        >
          <div className="w-full max-w-3xl px-5 md:px-6 flex flex-col gap-8">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold md:text-3xl">
                Choose an office
              </h2>
              <p className="text-muted-foreground">
                Pick an office to reserve a queue number or view its display
                screen.
              </p>
            </div>

            <Suspense
              fallback={
                <div className="p-12 text-center text-muted-foreground">
                  Loading offices…
                </div>
              }
            >
              <OfficeGrid />
            </Suspense>
          </div>
        </section>

        <ContactSection />

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
          All rights reserved &copy; 2026 CSAP.
        </footer>
      </div>
    </main>
  );
}
