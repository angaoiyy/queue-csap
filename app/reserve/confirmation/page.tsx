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
import { PrintTicketButton } from "@/components/print-ticket-button";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

async function ConfirmationContent({ searchParams }: Props) {
  const params = await searchParams;
  const queue = (params.queue as string) ?? "";
  const name = (params.name as string) ?? "";
  const studentId = (params.studentId as string) ?? "";
  const department = (params.department as string) ?? "";
  const inquiryType = (params.inquiryType as string) ?? "";
  const window = (params.window as string) ?? "";
  const position = (params.position as string) ?? "0";
  const wait = (params.wait as string) ?? "0";
  const date = (params.date as string) ?? "";

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
              <Link href="/reserve">Go to Reserve</Link>
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
            <p>
              <span className="font-medium">Student ID:</span> {studentId}
            </p>
            <p>
              <span className="font-medium">Department:</span> {department}
            </p>
            <p>
              <span className="font-medium">Inquiry Type:</span> {inquiryType}
            </p>
            <p>
              <span className="font-medium">Assigned Window:</span>{" "}
              {window || "To be announced"}
            </p>
            {/* <p>
              <span className="font-medium">Position in line:</span> {position}
            </p> */}
            {/* <p>
              <span className="font-medium">Estimated wait:</span> ~
              {Number(wait) || 0} minutes
            </p> */}
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
          <PrintTicketButton />
          <div className="flex flex-col gap-2">
            <Button variant="default" asChild>
              <Link href="/reserve">Reserve Another</Link>
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
      <ConfirmationContent searchParams={props.searchParams} />
    </Suspense>
  );
}
