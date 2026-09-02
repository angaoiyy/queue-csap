import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getOfficeBySlug } from "@/lib/offices";

async function ValidateOffice({
  params,
  children,
}: {
  params: Promise<{ office: string }>;
  children: React.ReactNode;
}) {
  const { office } = await params;
  const found = await getOfficeBySlug(office);
  if (!found) {
    notFound();
  }
  return <>{children}</>;
}

export default function OfficeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ office: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ValidateOffice params={params}>{children}</ValidateOffice>
    </Suspense>
  );
}
