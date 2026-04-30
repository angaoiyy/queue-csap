"use client";

import React from "react";
import { motion } from "framer-motion";

import { HeroSection } from "@/components/ui/hero-section-2";

export default function HeroSectionDemo() {
  return (
    <motion.div
      className="w-full space-y-10"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.4 }}
    >
      <HeroSection
        // logo={{
        //   url: "https://images.unsplash.com/photo-1526772662000-3f88f10405ff?auto=format&fit=crop&w=96&q=80",
        //   alt: "Colegio de San Antonio de Padua logo",
        //   text: "Colegio de San Antonio de Padua",
        // }}
        slogan="QUEUE MANAGEMENT RESEARCH"
        title={
          <>
            Web-Based Priority Numbers for <br />
            <span className="text-primary">Payments</span>
          </>
        }
        subtitle="The function of technology in queue management in Colegio de San Antonio de Padua."
        callToAction={{
          text: "VIEW THE PAPER",
          href: "#project",
        }}
        backgroundImage="/hero-school.png"
        contactInfo={{
          website: "csap.edu.ph",
          phone: "Payment Queue Services",
          address: "Colegio de San Antonio de Padua",
        }}
      />

      <motion.section
        id="project"
        className="grid gap-6 md:grid-cols-2"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.45 }}
      >
        <motion.article
          className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          whileHover={{ y: -3 }}
          transition={{ duration: 0.35 }}
        >
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            CAPSTONE SUBMISSION
          </p>
          <motion.h2
            className="mt-3 text-2xl font-bold leading-tight"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.05 }}
          >
            A Capstone Presented to the College of Business Education and
            Information System
          </motion.h2>
          <p className="mt-4 text-sm text-muted-foreground">
            Colegio de San Antonio de Padua, Guinsay, Danao City, Cebu
          </p>
          <div className="my-5 h-px w-full bg-border" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            In partial fulfillment of the requirements for the degree
            <span className="font-semibold text-foreground">
              {" "}
              Bachelor of Science in Information Systems.
            </span>
          </p>
        </motion.article>

        <motion.article
          className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          whileHover={{ y: -3 }}
          transition={{ duration: 0.35 }}
        >
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            RESEARCH MENTOR
          </p>
          <motion.h3
            className="mt-3 text-xl font-bold"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.05 }}
          >
            Mr. Alvin Joseph D. Valdez
          </motion.h3>
          <p className="mt-3 text-sm text-muted-foreground">
            Advises the capstone team on research structure, implementation
            quality, and academic compliance.
          </p>

          <div className="my-5 h-px w-full bg-border" />

          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            PROJECT FOCUS
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            A web-based priority numbering workflow for payment queues that
            improves service visibility, shortens waiting uncertainty, and
            supports organized campus transaction handling.
          </p>
        </motion.article>
      </motion.section>

      <motion.section
        className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        whileHover={{ y: -3 }}
        transition={{ duration: 0.35 }}
      >
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
          PROPONENTS
        </p>
        <motion.h3
          className="mt-3 text-2xl font-bold"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          Bachelor of Science in Information Systems
        </motion.h3>
        <div className="mt-6 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Andot, Mark R.",
            "Calvo, Jowee P.",
            "Caputolan, Nheil A.",
            "Concon Louie, Lewis L.",
            "Landero, Kent Louie M.",
            "Morales, Joshua John I.",
            "Regala, Albert B.",
          ].map((name) => (
            <motion.p
              key={name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3 }}
            >
              {name}
            </motion.p>
          ))}
        </div>
      </motion.section>
    </motion.div>
  );
}
