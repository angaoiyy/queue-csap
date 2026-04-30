'use client';
import Image from "next/image";
import { useRouter } from "next/navigation";




export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="min-h-svh flex flex-col bg-background">
      {/* CSAP-style header - deep maroon brand bar with logo */}
      <header className="bg-primary text-primary-foreground py-4 px-6 shadow">
        <div className="max-w-4xl  flex items-center justify-center gap-4">
          <Image
            src="/csap.png"
            alt="Colegio de San Antonio de Padua"
            width={56}
            height={56}
            className="object-contain cursor-pointer "
            onClick={ () => router.push("/") }
          />
          <div>
            <h1 className="font-bold text-lg leading-tight">
              Colegio de San Antonio de Padua
            </h1>
            <p className="text-primary-foreground/80 text-sm">CSAP</p>
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-6 md:p-10">
        {children}
      </main>
    </div>
  );
}
