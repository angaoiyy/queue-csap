'use client';
import { ReservationForm } from "@/components/reservation-form";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function ReservePage() {
  const router = useRouter();
    return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="mb-8 text-center flex items-center gap-2 justify-center flex-col">
      <Image onClick={() => router.push("/")} className="cursor-pointer object-contain" src="/csap.png" alt="CSAP Logo" width={100} height={100} />
        
      </div>
      <ReservationForm />
      <div className="mt-8 flex gap-4 text-sm">
       
       
      </div>
    </div>
  );
}
