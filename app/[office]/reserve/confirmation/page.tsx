import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  params: Promise<{ office: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

async function ConfirmationContent({ params, searchParams }: Props) {
  const { office } = await params;
  const sp = await searchParams;
  const queue = (sp.queue as string) ?? "";
  const name = (sp.name as string) ?? "";
  const studentId = (sp.studentId as string) ?? "";
  const department = (sp.department as string) ?? "";
  const inquiryType = (sp.inquiryType as string) ?? "";
  const claimOrRequest = (sp.claimOrRequest as string) ?? "";
  const window = (sp.window as string) ?? "";
  const date = (sp.date as string) ?? "";
  const printError = (sp.printError as string) ?? "";

  if (!queue) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid confirmation</CardTitle>
            <CardDescription>
              No queue number found. Please make a reservation first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/${office}/reserve`}>Go to Reserve</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Queue Reserved</CardTitle>
          <CardDescription>
            Your priority number has been generated. Please proceed to the
            waiting area.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">Your Queue Number</p>
            <p className="text-4xl font-bold tracking-wider">{queue}</p>
          </div>
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Name:</span> {name}
            </p>
            {studentId && (
              <p>
                <span className="font-medium">Student ID:</span> {studentId}
              </p>
            )}
            <p>
              <span className="font-medium">Department:</span> {department}
            </p>
            <p>
              <span className="font-medium">Inquiry Type:</span> {inquiryType}
            </p>
            {claimOrRequest && (
              <p>
                <span className="font-medium">Claim or Request:</span>{" "}
                {claimOrRequest}
              </p>
            )}
            <p>
              <span className="font-medium">Assigned Window:</span>{" "}
              {window || "To be announced"}
            </p>
            {date && (
              <p>
                <span className="font-medium">Date:</span>{" "}
                {new Date(date).toLocaleString("en-PH", {
                  timeZone: "Asia/Manila",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
          </div>
          {printError && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Your queue number is confirmed, but the ticket could not be
              printed. Please show this screen to staff.
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Button variant="default" asChild>
              <Link href={`/${office}/reserve`}>Reserve Another</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ConfirmationPage(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-6">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <ConfirmationContent {...props} />
    </Suspense>
  );
}
