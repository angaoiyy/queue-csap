"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

export function ReserveLogoLink() {
  const router = useRouter();
  return (
    <Image
      onClick={() => router.push("/")}
      className="cursor-pointer object-contain"
      src="/csap.png"
      alt="CSAP Logo"
      width={100}
      height={100}
    />
  );
}
