import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReserveLogoLink } from "@/components/reserve-logo-link";
import { getOfficeBySlug } from "@/lib/offices";

async function ReservePicker({
  params,
}: {
  params: Promise<{ office: string }>;
}) {
  const { office } = await params;
  const found = await getOfficeBySlug(office);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Reserve Queue Number</CardTitle>
        <CardDescription>
          {found?.label ?? "Queue"} — are you a new or old student?
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button asChild size="lg" className="h-16 text-base">
          <Link href={`/${office}/reserve/new`}>New Student</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="h-16 text-base">
          <Link href={`/${office}/reserve/old`}>Old Student</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ReservePickerPage({
  params,
}: {
  params: Promise<{ office: string }>;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-6">
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: "url('/csap-bg2.jpg')" }}
      />
      <div className="fixed inset-0 -z-10 bg-background/70 backdrop-blur-sm" />
      <div className="mb-8 text-center flex items-center gap-2 justify-center flex-col">
        <ReserveLogoLink />
      </div>
      <Suspense fallback={<div className="p-12">Loading...</div>}>
        <ReservePicker params={params} />
      </Suspense>
    </div>
  );
}
