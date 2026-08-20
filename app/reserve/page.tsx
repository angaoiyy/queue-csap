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

export default function ReservePickerPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="mb-8 text-center flex items-center gap-2 justify-center flex-col">
        <ReserveLogoLink />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reserve Queue Number</CardTitle>
          <CardDescription>Are you a new or old student?</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button asChild size="lg" className="h-16 text-base">
            <Link href="/reserve/new">New Student</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-16 text-base">
            <Link href="/reserve/old">Old Student</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
