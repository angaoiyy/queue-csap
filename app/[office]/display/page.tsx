import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DisplayScreen } from "@/components/display-screen";
import { getOfficeBySlug } from "@/lib/offices";

async function DisplayResolver({
  params,
}: {
  params: Promise<{ office: string }>;
}) {
  const { office } = await params;
  const found = await getOfficeBySlug(office);
  if (!found) {
    notFound();
  }
  return (
    <DisplayScreen
      officeSlug={found.slug}
      officeId={found.id}
      officeLabel={found.label}
    />
  );
}

export default function OfficeDisplayPage({
  params,
}: {
  params: Promise<{ office: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[hsl(356,45%,15%)]">
          <p className="text-xl text-white/80">Loading...</p>
        </div>
      }
    >
      <DisplayResolver params={params} />
    </Suspense>
  );
}
