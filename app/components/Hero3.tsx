"use client";

import React, { useRef } from "react";
import {
  motion,
  useInView,
  easeOut,
  useScroll,
  useTransform,
} from "framer-motion";
import Hero4 from "./Hero4";
import { Play } from "lucide-react";

const Hero3: React.FC = () => {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: false, margin: "-100px" });
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const y1 = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, 50]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1.02, 1]);

  return (
    <>
      <div
        ref={sectionRef}
        className="flex h-auto flex-col md:flex-row items-center justify-between p-6 md:p-12 bg-gradient-to-r from-white to-green-100 min-h-[400px] relative overflow-hidden"
      >
        <motion.div
          className="absolute top-20 left-1/3 w-24 h-24  rounded-full opacity-20"
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
            x: [0, 40, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <motion.div
          className="absolute bottom-20 right-1/4 w-20 h-20  rounded-full opacity-20"
          animate={{
            scale: [1, 1.3, 1],
            y: [0, -30, 0],
            rotate: [0, -180, -360],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <motion.div
          className="text-left max-w-lg ml-4 md:ml-16 relative z-10"
          initial={{ opacity: 0, x: -60, rotateY: -15 }}
          animate={{
            opacity: isInView ? 1 : 0,
            x: isInView ? 0 : -60,
            rotateY: isInView ? 0 : -15,
          }}
          transition={{
            duration: 0.8,
            ease: easeOut,
          }}
          style={{ y: y1 }}
        >
          <motion.h1
            className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6 leading-tight"
            initial={{ opacity: 0, y: 60, rotateX: -15 }}
            animate={{
              opacity: isInView ? 1 : 0,
              y: isInView ? 0 : 60,
              rotateX: isInView ? 0 : -15,
            }}
            transition={{
              duration: 0.8,
              ease: easeOut,
            }}
          >
            Ready to Transform Your{" "}
            <span className="text-purple-600">Product Demos?</span>
          </motion.h1>
          <motion.p
            className="text-base md:text-lg text-gray-700 mb-8"
            initial={{ opacity: 0, y: 60 }}
            animate={{
              opacity: isInView ? 1 : 0,
              y: isInView ? 0 : 60,
            }}
            transition={{
              duration: 0.8,
              ease: easeOut,
              delay: 0.2,
            }}
          >
            Join thousands of companies using AI to create compelling demo
            videos that convert. Start your free trial today.
          </motion.p>
          <motion.ul
            className="text-gray-700 space-y-6 text-base md:text-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: isInView ? 1 : 0 }}
            transition={{
              duration: 0.8,
              ease: easeOut,
              delay: 0.4,
            }}
          >
            {[
              { label: "Product Onboarding" },
              { label: "Feature Walkthrough" },
              { label: "Sales Demo" },
            ].map((item, index) => (
              <motion.li
                key={index}
                className="flex items-start"
                initial={{ opacity: 0, x: -20 }}
                animate={{
                  opacity: isInView ? 1 : 0,
                  x: isInView ? 0 : -20,
                }}
                transition={{
                  duration: 0.5,
                  ease: easeOut,
                  delay: 0.6 + index * 0.1,
                }}
                whileHover={{ x: 5, scale: 1.02 }}
              >
                <span className="mr-2">
                  <Play color="#fff" size={20} />
                </span>
                {item.label}
              </motion.li>
            ))}
          </motion.ul>
        </motion.div>
        <motion.div
          className="mt-12 md:mt-0 w-full max-w-md bg-[#C1A0FF] p-8 rounded-2xl shadow-xl relative z-10"
          initial={{ opacity: 0, x: 60, rotateY: 15 }}
          animate={{
            opacity: isInView ? 1 : 0,
            x: isInView ? 0 : 60,
            rotateY: isInView ? 0 : 15,
          }}
          transition={{
            duration: 0.8,
            ease: easeOut,
            delay: 0.3,
          }}
          style={{ y: y2, scale }}
          whileHover={{
            boxShadow: "0 25px 50px rgba(193, 160, 255, 0.3)",
            y: -5,
          }}
        >
          <form className="space-y-6">
            {[
              { type: "email", placeholder: "Enter your Email" },
              { type: "text", placeholder: "Full Name" },
              { type: "text", placeholder: "Company" },
              { type: "text", placeholder: "Product URL (Optional)" },
            ].map((input, index) => (
              <motion.input
                key={index}
                type={input.type}
                placeholder={input.placeholder}
                className="w-full py-4 px-5 rounded-lg bg-purple-100 text-gray-700 text-base focus:outline-none focus:ring-2 focus:ring-purple-500"
                whileFocus={{
                  scale: 1.02,
                  boxShadow: "0 0 20px rgba(147, 51, 234, 0.2)",
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{
                  opacity: isInView ? 1 : 0,
                  y: isInView ? 0 : 20,
                }}
                transition={{
                  duration: 0.5,
                  ease: easeOut,
                  delay: 0.5 + index * 0.1,
                }}
              />
            ))}
            <motion.button
              type="submit"
              className="w-full py-4 bg-white text-purple-600 font-semibold rounded-lg flex items-center justify-center gap-2 hover:bg-purple-100 transition"
              whileHover={{
                scale: 1.05,
                boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
                y: -2,
              }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{
                opacity: isInView ? 1 : 0,
                y: isInView ? 0 : 20,
              }}
              transition={{
                duration: 0.5,
                ease: easeOut,
                delay: 0.9,
              }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              Start Free Trial
            </motion.button>
          </form>
        </motion.div>
      </div>
      <Hero4 />
    </>
  );
};

export default Hero3;
