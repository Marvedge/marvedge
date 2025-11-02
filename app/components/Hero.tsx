"use client";

import React, { useRef } from "react";
import Image from "next/image";
import { FaPlay } from "react-icons/fa6";
import { motion, useInView, useScroll, useTransform, easeOut } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const Hero: React.FC = () => {
  const router = useRouter();
  const { status } = useSession();

  const textSegments = [
    { text: "Turn ", color: "text-[#494369]" },
    { text: "Clicks", color: "text-[#261753]" },
    { text: " Into Customers with", color: "text-[#494369]" },
    { text: "Interactive Demos", color: "text-[#8A76FC]/70" },
  ];

  const handleActionButtonClick = () => {
    if (status === "authenticated") {
      router.push("/dashboard");
    } else {
      router.push("/auth/signup");
    }
  };

  const actionButtonText = status === "authenticated" ? "Go To Dashboard" : "Start Free Trial";

  const ref = useRef<HTMLElement>(null);
  // Set `once: true` to trigger isInView only once when the section enters the viewport
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const y1 = useTransform(scrollYProgress, [0, 1], [0, -100]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const letterVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  };

  const fadeInUp = {
    hidden: { opacity: 0, y: 60, rotateX: -15 },
    visible: {
      opacity: 1,
      y: 0,
      rotateX: 0,
      transition: { duration: 0.8, ease: easeOut },
    },
  };

  const fadeInLeft = {
    hidden: { opacity: 0, x: -60, rotateY: -15 },
    visible: {
      opacity: 1,
      x: 0,
      rotateY: 0,
      transition: { duration: 0.8, ease: easeOut },
    },
  };

  return (
    <section
      ref={ref}
      className="min-h-screen pt-48 sm:pt-32 md:pt-32 lg:pt-[170px] pb-4 bg-white relative overflow-hidden z-0"
      style={{ zIndex: 0 }}
    >
      <motion.div
        className="absolute bottom-40 left-1/4 w-8 sm:w-12 h-8 sm:h-12 bg-green-200 rounded-full opacity-20"
        animate={{
          scale: [1, 1.3, 1],
          x: [0, 40, 0],
          rotate: [0, 90, 180],
        }}
        transition={{
          duration: 7,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <div className="w-full px-3 sm:px-4 md:px-6 lg:max-w-6xl lg:mx-auto flex flex-col items-center text-center relative">
        <motion.div
          className="w-full"
          variants={fadeInLeft}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          style={{ y: y1 }}
        >
          <motion.h1
            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold leading-tight"
            style={{
              fontFamily: "var(--font-raleway)",
              fontWeight: 900,
              lineHeight: "1.2",
              letterSpacing: "0%",
            }}
            variants={containerVariants}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            aria-label="Hero heading"
          >
            {textSegments.map((segment, segmentIndex) => (
              <span key={segmentIndex} className={segment.color}>
                {segment.text.split("").map((char, charIndex) => (
                  <motion.span key={`${segmentIndex}-${charIndex}`} variants={letterVariants}>
                    {char === " " ? "\u00A0" : char}
                  </motion.span>
                ))}
                {segmentIndex === 2 ? <br /> : null}
              </span>
            ))}
          </motion.h1>
          <motion.p
            className="mt-1 sm:mt-1 text-gray-600 text-base sm:text-lg max-w-2xl mx-auto"
            style={{ fontFamily: "var(--font-raleway)", fontWeight: 400 }}
            variants={fadeInUp}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
          >
            Marvedge turns your product into an instant demo — no editing, no team, just click and
            convert.
          </motion.p>

          <motion.div
            className="mt-4 sm:mt-10 flex flex-col sm:flex-row gap-4 sm:gap-5 justify-center items-center"
            variants={fadeInUp}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
          >
            <motion.button
              onClick={handleActionButtonClick}
              className="flex items-center justify-center cursor-pointer gap-2 bg-[#8A76FC] hover:bg-[#7563E8] text-white px-8 sm:px-12 py-3 sm:py-4 rounded-lg font-semibold text-base sm:text-lg transition whitespace-nowrap"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <FaPlay className="text-lg sm:text-xl" />
              {actionButtonText}
            </motion.button>
            <motion.button
              className="flex items-center justify-center cursor-pointer gap-2 border-2 border-gray-300 bg-white shadow-md px-8 sm:px-12 py-3 sm:py-4 rounded-lg text-gray-800 text-base sm:text-lg font-semibold hover:shadow-lg transition whitespace-nowrap"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <Image src="/ri_gemini-fill.png" alt="Explore Examples" width={20} height={20} />
              Explore Examples
            </motion.button>
          </motion.div>
        </motion.div>

        <motion.div
          className="w-full mt-2 sm:mt-3 md:mt-4 rounded-4xl overflow-hidden"
          variants={fadeInUp}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          aria-label="Landing page hero image"
        >
          <Image
            src="/images/landing_image.png"
            alt="Interactive demo showcase"
            width={1200}
            height={600}
            className="w-full h-auto object-cover"
          />
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;
