import { redirect } from "next/navigation";

// Legacy route: reservations are now per-office at /<office>/reserve.
export default function LegacyReservePage() {
  redirect("/");
}
