import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Page() {
  return (
    <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                Account created — pending approval
              </CardTitle>
              <CardDescription>
                A super admin must approve your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Your staff account has been created but you are not signed in
                yet. The system administrator must approve it before you can log
                in. If a confirmation email was sent, confirm it as well.
              </p>
            </CardContent>
          </Card>
        </div>
    </div>
  );
}
