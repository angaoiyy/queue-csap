import { Suspense } from "react";
import { SignUpForm } from "@/components/sign-up-form";
import { getAllOffices } from "@/lib/offices";

async function SignUpWithOffices() {
  const offices = await getAllOffices();
  return (
    <SignUpForm
      offices={offices.map((o) => ({ slug: o.slug, label: o.label }))}
    />
  );
}

export default function Page() {
  return (
    <div className="w-full max-w-sm">
      <Suspense fallback={<div className="p-12 text-center text-muted-foreground">Loading…</div>}>
        <SignUpWithOffices />
      </Suspense>
    </div>
  );
}
