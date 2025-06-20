"use client";

import React, { useEffect, useRef } from "react";
import { FaPlay } from "react-icons/fa6";
import { Sparkles } from "lucide-react";
import {
  motion,
  useAnimationControls,
  useInView,
  useScroll,
  useTransform,
  easeOut,
} from "framer-motion";
import Hero1 from "./Hero1";

const Hero: React.FC = () => {
  const textSegments = [
    { text: "Transform URL's into", color: "text-gray-700" },
    { text: "COMPELLING DEMO", color: "text-[#7C55D7]" },
    { text: "VIDEO", color: "text-[#7C55D7]" },
    { text: "with AI", color: "text-gray-700" },
  ];

  const controls = useAnimationControls();
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: false, margin: "-100px" });
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
    },
  };

  const fadeInLeft = {
    hidden: { opacity: 0, x: -60, rotateY: -15 },
    visible: {
      opacity: 1,
      x: 0,
      rotateY: 0,
    },
  };

  useEffect(() => {
    const animateLoop = async () => {
      await controls.start("visible");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await controls.start("hidden");
      animateLoop();
    };
    animateLoop();
    return () => controls.stop();
  }, [controls]);

  return (
    <>
      <section
        ref={ref}
        className="min-h-[90vh] pt-[140px] h-auto pb-16 bg-gradient-to-br from-white via-[#f9fef4] to-[#e6f0d6] relative overflow-hidden z-10"
        style={{ zIndex: 10 }}
      >
        <motion.div
          className="absolute bottom-40 left-1/4 w-12 h-12 bg-green-200 rounded-full opacity-20"
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

        <div className="w-full px-2 sm:px-4 md:max-w-7xl md:mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 items-center relative">
          <motion.div
            className="pl-0 sm:pl-0 md:pl-0 mt-10 sm:mt-16"
            variants={fadeInLeft}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            transition={{ duration: 0.8, ease: easeOut }}
            style={{ y: y1 }}
          >
            <motion.h1
              className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight text-gray-700"
              variants={containerVariants}
              initial="hidden"
              animate={controls}
              aria-label="Hero heading"
            >
              {textSegments.map((segment, segmentIndex) => (
                <span key={segmentIndex} className={segment.color}>
                  {segment.text.split("").map((char, charIndex) => (
                    <motion.span
                      key={`${segmentIndex}-${charIndex}`}
                      variants={letterVariants}
                    >
                      {char === " " ? "\u00A0" : char}
                    </motion.span>
                  ))}
                  {segmentIndex === 0 || segmentIndex === 1 ? <br /> : null}
                  {segmentIndex === 2 ? " " : null}
                </span>
              ))}
            </motion.h1>
            <motion.p
              className="mt-4 sm:mt-6 text-gray-600 text-base sm:text-lg max-w-[98%] sm:max-w-[95%]"
              variants={fadeInUp}
              initial="hidden"
              animate={isInView ? "visible" : "hidden"}
              transition={{ duration: 0.8, ease: easeOut, delay: 0.2 }}
            >
              Stop spending hours creating product demos. Our AI analyzes your
              product URL and automatically generates professional demo videos
              that convert visitors into customers.
            </motion.p>

            <motion.div
              className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-4 sm:gap-5"
              variants={fadeInUp}
              initial="hidden"
              animate={isInView ? "visible" : "hidden"}
              transition={{ duration: 0.8, ease: easeOut, delay: 0.4 }}
            >
              <motion.button
                className="flex items-center justify-center cursor-pointer gap-2 bg-[#6B46C1] hover:bg-[#553c9a] text-gray-200 px-6 sm:px-10 py-3 sm:py-4 rounded-lg font-semibold text-base sm:text-lg transition whitespace-nowrap"
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <FaPlay className="text-lg sm:text-xl" />
                Create Demo Video
              </motion.button>
              <motion.button
                className="flex items-center justify-center cursor-pointer gap-2 border border-gray-300 bg-white shadow-sm px-6 sm:px-10 py-3 sm:py-4 rounded-lg text-gray-600 text-base sm:text-lg font-medium hover:shadow-md transition whitespace-nowrap"
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <Sparkles size={18} />
                Explore Examples
              </motion.button>
            </motion.div>
          </motion.div>

          <motion.div
            className="w-[90%] sm:w-[85%] md:w-[80%] h-[350px] sm:h-[400px] mt-4 sm:mt-8 rounded-[32px] bg-gradient-to-br from-[#c2b3f5] to-[#8a6ec5] flex items-center justify-center mx-auto lg:mr-[-32] md:ml-auto md:mr-0"
            variants={fadeInUp}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            transition={{ duration: 0.8, ease: easeOut }}
            aria-label="Demo video placeholder"
          >
            <div className="w-[90%] sm:w-[85%] h-[85%] rounded-2xl bg-[#b199f2]" />
          </motion.div>
        </div>
      </section>
      <Hero1 />
    </>
  );
};

export default Hero;
