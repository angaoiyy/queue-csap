import { redirect } from "next/navigation";

// Legacy route: the display screen is now per-office at /<office>/display.
export default function LegacyDisplayPage() {
  redirect("/");
}
