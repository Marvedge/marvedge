"use client";

import React, { useRef, useState } from "react";
import { motion, useInView, easeOut, useScroll, useTransform } from "framer-motion";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const Hero3: React.FC = () => {
  const sectionRef = useRef(null);
  // Set `once: true` to trigger only once when section enters viewport
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState(""); // Added state for company
  const [url, setUrl] = useState(""); // Added state for product URL

  const y1 = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, 50]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1.02, 1]);

  const router = useRouter();
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) {
      return;
    }

    router.push(`/auth/signup?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
  };

  return (
    <div
      ref={sectionRef}
      className="bg-white min-h-[400px] relative overflow-hidden pt-12 sm:pt-16 md:pt-32 lg:pt-[170px] pb-12"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
        <div className="flex h-auto flex-col md:flex-row items-center justify-between gap-6 sm:gap-8 relative z-10">
          <motion.div
            className="text-left flex-1 relative z-10"
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
            style={{ y: y1, fontFamily: "var(--font-raleway)" }}
          >
            <motion.h1
              className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4 sm:mb-6 leading-tight"
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
              style={{ fontWeight: 700 }}
            >
              <span className="text-[#494369]">Ready to Transform Your</span>{" "}
              <span className="text-[#8A76FC]/70">Product Demos?</span>
            </motion.h1>
            <motion.p
              className="text-sm sm:text-base md:text-lg text-gray-700 mb-6 sm:mb-8"
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
              An edge that you will get and let your product <br className="hidden sm:block" />{" "}
              speak for itself.
            </motion.p>
            <motion.ul
              className="text-gray-700 space-y-4 sm:space-y-6 text-sm sm:text-base md:text-lg"
              initial={{ opacity: 0 }}
              animate={{ opacity: isInView ? 1 : 0 }}
              transition={{
                duration: 0.8,
                ease: easeOut,
                delay: 0.4,
              }}
            >
              {[
                {
                  label: "Reducing time-to-value for prospects and users",
                  icon: "check",
                },
                {
                  label: "Professional voiceover and background music",
                  icon: "briefcase",
                },
                {
                  label: "Compelling video editing workspace integration",
                  icon: "music",
                },
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
                  <span className="mr-3 shrink-0 flex items-center justify-center">
                    {item.icon === "check" && <Check color="#8C5BFF" size={24} strokeWidth={3} />}
                    {item.icon === "briefcase" && (
                      <Image src="/solar_card-broken.png" alt="voiceover" width={24} height={24} />
                    )}
                    {item.icon === "music" && (
                      <Image src="/iconamoon_headphone.png" alt="editing" width={24} height={24} />
                    )}
                  </span>
                  {item.label}
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
          <motion.div
            className="mt-6 md:mt-0 w-full max-w-md p-4 sm:p-6 md:p-8 rounded-2xl shadow-lg sm:shadow-xl relative z-10 shrink-0"
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
            style={{
              y: y2,
              scale,
              background: "linear-gradient(135deg, #9D7FE8 0%, #C8A8FF 100%)",
            }}
            whileHover={{
              boxShadow: "0 25px 50px rgba(193, 160, 255, 0.3)",
              y: -5,
            }}
          >
            <form className="space-y-4 sm:space-y-6" onSubmit={handleSubmit}>
              <motion.input
                type="email"
                placeholder="Enter your Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full py-3 sm:py-4 px-4 sm:px-5 rounded-lg bg-[#DCC8FF] text-gray-700 text-sm sm:text-base placeholder:text-white/70 focus:outline-none focus:ring-2 focus:ring-white"
                style={{ fontFamily: "var(--font-raleway)", fontWeight: 400 }}
                whileFocus={{
                  scale: 1.02,
                  boxShadow: "0 0 20px rgba(255, 255, 255, 0.2)",
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{
                  opacity: isInView ? 1 : 0,
                  y: isInView ? 0 : 20,
                }}
                transition={{
                  duration: 0.5,
                  ease: easeOut,
                  delay: 0.5,
                }}
              />
              <motion.input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full py-3 sm:py-4 px-4 sm:px-5 rounded-lg bg-[#DCC8FF] text-gray-700 text-sm sm:text-base placeholder:text-white/70 focus:outline-none focus:ring-2 focus:ring-white"
                style={{ fontFamily: "var(--font-raleway)", fontWeight: 400 }}
                whileFocus={{
                  scale: 1.02,
                  boxShadow: "0 0 20px rgba(255, 255, 255, 0.2)",
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{
                  opacity: isInView ? 1 : 0,
                  y: isInView ? 0 : 20,
                }}
                transition={{
                  duration: 0.5,
                  ease: easeOut,
                  delay: 0.6,
                }}
              />
              <motion.input
                type="text"
                placeholder="Company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full py-3 sm:py-4 px-4 sm:px-5 rounded-lg bg-[#DCC8FF] text-gray-700 text-sm sm:text-base placeholder:text-white/70 focus:outline-none focus:ring-2 focus:ring-white"
                style={{ fontFamily: "var(--font-raleway)", fontWeight: 400 }}
                whileFocus={{
                  scale: 1.02,
                  boxShadow: "0 0 20px rgba(255, 255, 255, 0.2)",
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{
                  opacity: isInView ? 1 : 0,
                  y: isInView ? 0 : 20,
                }}
                transition={{
                  duration: 0.5,
                  ease: easeOut,
                  delay: 0.7,
                }}
              />
              <motion.input
                type="text"
                placeholder="Product URL (Optional)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full py-3 sm:py-4 px-4 sm:px-5 rounded-lg bg-[#DCC8FF] text-gray-700 text-sm sm:text-base placeholder:text-white/70 focus:outline-none focus:ring-2 focus:ring-white"
                style={{ fontFamily: "var(--font-raleway)", fontWeight: 400 }}
                whileFocus={{
                  scale: 1.02,
                  boxShadow: "0 0 20px rgba(255, 255, 255, 0.2)",
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{
                  opacity: isInView ? 1 : 0,
                  y: isInView ? 0 : 20,
                }}
                transition={{
                  duration: 0.5,
                  ease: easeOut,
                  delay: 0.8,
                }}
              />
              <motion.button
                type="submit"
                className="w-full cursor-pointer py-3 sm:py-4 bg-white text-[#8370F0] font-semibold rounded-lg flex items-center justify-center gap-2 text-sm sm:text-base hover:bg-purple-100 transition"
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
                <Image src="/Group 55.png" alt="Start Free Trial" width={20} height={20} />
                Start Free trial
              </motion.button>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Hero3;
