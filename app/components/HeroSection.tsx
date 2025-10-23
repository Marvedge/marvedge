"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Hero from "./Hero";
import Hero1 from "./Hero1";
import Hero2 from "./Hero2";
import Hero3 from "./Hero3";
import Hero4 from "./Hero4";

export default function HeroSection() {
  const pathname = usePathname();

  return pathname === "/" ? (
    <>
      <Hero />
      <Hero1 />
      <Hero2 />
      <Hero3 />
      <Hero4 />
    </>
  ) : null;
}
