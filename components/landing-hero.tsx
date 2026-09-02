"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { MonitorPlay, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: Smartphone, label: "Reserve Number" },
  { icon: MonitorPlay, label: "Watch the display screen" },
];

export function LandingHero() {
  return (
    <section className="w-full border-b border-b-foreground/10 bg-primary/[0.04]">
      <div className="mx-auto grid w-full max-w-5xl items-center gap-10 px-5 py-14 md:grid-cols-2 md:px-6 md:py-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col gap-6"
        >
          <span className="inline-flex w-fit items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            Colegio de San Antonio de Padua
          </span>

          <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            Web-Based Priority Numbers for{" "}
            <span className="text-primary">Payment and Requests</span>
          </h1>

          <p className="max-w-md text-lg text-muted-foreground">
            Reserve a queue number, follow your place on the display screen, and
            get served without standing in line.
          </p>

          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="#offices">Reserve a number</a>
            </Button>
          </div>

          <ul className="mt-2 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                {label}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative aspect-[4/3] overflow-hidden rounded-xl border shadow-lg"
        >
          <Image
            src="/hero-school.png"
            alt="Colegio de San Antonio de Padua — Durano Campus"
            fill
            priority
            sizes="(max-width: 768px) 100vw, 40vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/40 via-primary/5 to-transparent" />
        </motion.div>
      </div>
    </section>
  );
}
