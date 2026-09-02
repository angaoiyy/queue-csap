import { redirect } from "next/navigation";

export default async function OfficeIndexPage({
  params,
}: {
  params: Promise<{ office: string }>;
}) {
  const { office } = await params;
  redirect(`/${office}/reserve`);
}
