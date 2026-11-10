"use client";

import React, { useRef, useState } from "react";
import "react-toastify/dist/ReactToastify.css";
import { ToastContainer, toast } from "react-toastify";
import Image from "next/image";
import { motion, useInView, easeOut, useScroll, useTransform } from "framer-motion";
import { usePathname } from "next/navigation";

const socialIcons = [
  {
    image: "/Icon.png",
    label: "Instagram",
    url: "https://www.instagram.com/marvedgemedia?igsh=aGcxOXpyNGJkMWdj",
  },
  {
    image: "/Icon(2).png",
    label: "LinkedIn",
    url: "https://www.linkedin.com/company/marvedge/posts/?feedView=all",
  },
];

const linkSections = [
  {
    title: "",
    items: ["", ""],
  },
];

const SocialIcon: React.FC<{
  image: string;
  url: string;
  label: string;
}> = ({ image, url, label }) => {
  return (
    <div className="social rounded-4xl w-20 h-14 sm:w-24 sm:h-16 md:w-24 md:h-[72px] bg-white/5 hover:bg-white/10 backdrop-blur-sm transition flex items-center justify-center overflow-hidden shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className="flex items-center justify-center w-full h-full"
      >
        <Image
          src={image}
          alt={label}
          width={24}
          height={24}
          className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 object-contain"
        />
      </a>
    </div>
  );
};

const LinkSection: React.FC<{
  title: string;
  items: string[];
  index: number;
}> = ({ title, items, index }) => {
  const sectionRef = useRef<HTMLDivElement>(null);

  const isInView = useInView(sectionRef, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={sectionRef}
      className="min-w-[100px]"
      initial={{ opacity: 0, y: 30 }}
      animate={{
        opacity: isInView ? 1 : 0,
        y: isInView ? 0 : 30,
      }}
      transition={{
        duration: 0.6,
        ease: easeOut,
        delay: index * 0.1,
      }}
    >
      <h3
        className="text-white font-semibold mb-2 text-sm sm:text-base md:text-lg"
        style={{ fontFamily: "var(--font-raleway)" }}
      >
        {title}
      </h3>
      <ul
        className="text-gray-300 space-y-1.5 text-xs sm:text-sm md:text-base"
        style={{ fontFamily: "var(--font-raleway)" }}
      >
        {items.map((item, itemIndex) => (
          <motion.li
            key={itemIndex}
            className="hover:text-[#a68cff] cursor-pointer transition-colors duration-200"
            initial={{ opacity: 0, x: -10 }}
            animate={{
              opacity: isInView ? 1 : 0,
              x: isInView ? 0 : -10,
            }}
            transition={{
              duration: 0.4,
              ease: easeOut,
              delay: index * 0.1 + itemIndex * 0.05,
            }}
            whileHover={{
              x: 5,
              scale: 1.05,
            }}
          >
            {item}
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
};

const WaitlistSection: React.FC = () => {
  const formRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(formRef, { once: true, margin: "-50px" });
  const [form, setForm] = useState({
    email: "",
    name: "",
    message: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const { email, name, message } = form;

    const res = await fetch("/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, name, message }),
    });

    const result = await res.json();
    if (res.ok) {
      toast.success("Message sent successfully!");
      setForm({ email: "", name: "", message: "" });
    } else {
      toast.error(result.error || "Failed to send message.");
    }
  };

  return (
    <div className="w-full bg-white pt-6 sm:pt-8 pb-12 sm:pb-16 px-3 sm:px-4 md:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-[-10%] left-1/2 transform -translate-x-1/2 w-full max-w-4xl pointer-events-none z-0">
        <Image
          src="/Ellipse 24.png"
          alt="Background ellipse center"
          width={50}
          height={50}
          className="w-full h-auto"
        />
      </div>

      <div className="absolute top-[20%] left-[-5%] w-xl max-w-xl pointer-events-none z-0">
        <Image
          src="/Ellipse 25.png"
          alt="Background ellipse left"
          width={1}
          height={1}
          className="w-full h-auto opacity-80"
        />
      </div>

      <div className="absolute top-[-30%] right-[-10%] w-xl max-w-xl pointer-events-none z-0">
        <Image
          src="/Ellipse 25.png"
          alt="Background ellipse right"
          width={1}
          height={1}
          className="w-full h-auto opacity-80"
        />
      </div>

      <motion.div
        ref={formRef}
        className="max-w-2xl mx-auto text-center relative z-10"
        initial={{ opacity: 0, y: 60 }}
        animate={{
          opacity: isInView ? 1 : 0,
          y: isInView ? 0 : 60,
        }}
        transition={{ duration: 0.8, ease: easeOut }}
      >
        <motion.form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 40 }}
          animate={{
            opacity: isInView ? 1 : 0,
            y: isInView ? 0 : 40,
          }}
          transition={{ duration: 0.7, ease: easeOut, delay: 0.3 }}
        >
          {(
            [] as Array<{
              type?: string;
              placeholder: string;
              name: "email" | "name" | "message";
              isTextarea?: boolean;
            }>
          )
            .concat([])
            .map((input, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{
                  opacity: isInView ? 1 : 0,
                  x: isInView ? 0 : -20,
                }}
                transition={{
                  duration: 0.5,
                  ease: easeOut,
                  delay: 0.3 + index * 0.1,
                }}
              >
                {input.isTextarea ? (
                  <motion.textarea
                    name={input.name}
                    placeholder={input.placeholder}
                    value={form[input.name as keyof typeof form]}
                    onChange={handleChange}
                    rows={4}
                    className="bg-white text-[#2d2347] w-full placeholder:text-[#999999] rounded-lg px-4 py-3 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#8C5BFF] resize-none border border-[#e0e0e0]"
                    style={{
                      fontFamily: "var(--font-raleway)",
                      fontWeight: 400,
                    }}
                    whileFocus={{
                      scale: 1.02,
                      boxShadow: "0 0 20px rgba(140, 91, 255, 0.2)",
                    }}
                  />
                ) : (
                  <motion.input
                    type={input.type}
                    name={input.name}
                    placeholder={input.placeholder}
                    value={form[input.name as keyof typeof form]}
                    onChange={handleChange}
                    className="bg-white text-[#2d2347] w-full placeholder:text-[#999999] rounded-lg px-4 py-3 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#8C5BFF] border border-[#e0e0e0]"
                    style={{
                      fontFamily: "var(--font-raleway)",
                      fontWeight: 400,
                    }}
                    whileFocus={{
                      scale: 1.02,
                      boxShadow: "0 0 20px rgba(140, 91, 255, 0.2)",
                    }}
                  />
                )}
              </motion.div>
            ))}
        </motion.form>
      </motion.div>
    </div>
  );
};

const FooterBrandContent: React.FC<{ isInView: boolean }> = ({ isInView }) => (
  <motion.div
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
    <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
      <div className="footer-logo-box flex items-center justify-center w-14 h-14 rounded-[15px] border border-[rgba(139,92,255,0.28)] bg-[rgba(14,16,36,0.7)] shrink-0">
        <Image
          src="/images/Logo.png"
          alt="Marvedge Logo"
          width={28}
          height={28}
          className="w-7 h-7 object-contain dark:hidden"
        />
        <Image
          src="/images/logo_dark.png"
          alt="Marvedge Logo dark"
          width={28}
          height={28}
          className="w-7 h-7 object-contain hidden dark:block"
        />
      </div>
      <h2
        className="brand text-white text-lg sm:text-xl md:text-2xl font-semibold"
        style={{ fontFamily: "var(--font-raleway)" }}
      >
        MAR<strong className="text-white">VEDGE</strong>
      </h2>
    </div>
    <p
      className="text-gray-300 text-xs sm:text-sm md:text-base max-w-xs sm:max-w-sm"
      style={{ fontFamily: "var(--font-raleway)" }}
    >
      Transform your product URLs into compelling demo videos with the power of AI. Boost
      conversations and save time with automated video creation.
    </p>

    {/* 2nd Logo: Orithm Technologies Pvt. Ltd. */}
    <div className="mt-5 pt-4 border-t border-[rgba(165,139,255,0.16)] flex flex-col items-start gap-2">
      <span
        className="text-[11px] uppercase tracking-wider text-gray-400 font-medium opacity-85"
        style={{ fontFamily: "var(--font-raleway)" }}
      >
        A Product of
      </span>
      <div className="relative group inline-flex items-center">
        <Image
          src="/images/orithm_logo_dark.png"
          alt="Orithm Technologies Pvt. Ltd."
          width={802}
          height={925}
          className="h-16 sm:h-20 w-auto object-contain transition-transform duration-200 group-hover:scale-105 drop-shadow-[0_2px_12px_rgba(255,180,0,0.15)]"
        />
      </div>
    </div>
  </motion.div>
);

const FooterSocials: React.FC<{ isInView: boolean }> = ({ isInView }) => (
  <motion.div
    className="sm:shrink-0 sm:ml-auto  flex justify-end shrink-0"
    initial={{ opacity: 0, y: 60 }}
    animate={{
      opacity: isInView ? 1 : 0,
      y: isInView ? 0 : 60,
    }}
    transition={{
      duration: 0.8,
      ease: easeOut,
      delay: 0.6,
    }}
  >
    <motion.div
      className="flex gap-4 sm:gap-5 md:gap-6"
      initial={{ opacity: 0, y: 30 }}
      animate={{
        opacity: isInView ? 1 : 0,
        y: isInView ? 0 : 30,
      }}
      transition={{
        duration: 0.8,
        ease: easeOut,
        delay: 0.7,
      }}
    >
      {socialIcons.map((icon, index) => (
        <SocialIcon key={index} image={icon.image} url={icon.url} label={icon.label} />
      ))}
    </motion.div>
  </motion.div>
);

const FooterCopyright: React.FC<{ isInView: boolean }> = ({ isInView }) => {
  const currentYear = new Date().getFullYear();

  return (
    <motion.footer
      className="copyright w-full max-w-7xl mx-auto flex flex-col items-center pt-6 pb-8 px-3 sm:px-4 border-t border-[rgba(165,139,255,0.12)] relative z-10 mt-8"
      initial={{ opacity: 0, y: 60 }}
      animate={{
        opacity: isInView ? 1 : 0,
        y: isInView ? 0 : 60,
      }}
      transition={{
        duration: 0.8,
        ease: easeOut,
        delay: 0.8,
      }}
    >
      <motion.p
        className="text-gray-400 text-xs sm:text-sm font-semibold text-center opacity-70"
        style={{ fontFamily: "var(--font-raleway)" }}
        initial={{ opacity: 0, y: 30 }}
        animate={{
          opacity: isInView ? 1 : 0,
          y: isInView ? 0 : 30,
        }}
        transition={{
          duration: 0.8,
          ease: easeOut,
          delay: 1.0,
        }}
      >
        Copyright © {currentYear}. All rights reserved. Created with purple heart for better
        conversation.
      </motion.p>
    </motion.footer>
  );
};

const Footer: React.FC = () => {
  const sectionRef = useRef(null);
  const pathname = usePathname();

  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, -30]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1.01, 1]);

  return (
    <>
      {pathname !== "/pricing" && <WaitlistSection />}
      <div
        ref={sectionRef}
        className="footer w-full bg-[#261753] min-h-[40vh] relative overflow-hidden flex flex-col justify-between"
      >
        <section className="w-full max-w-7xl mx-auto py-6 sm:py-8 px-3 sm:px-4 md:px-6 lg:px-8 flex flex-row flex-wrap sm:flex-nowrap sm:justify-between sm:items-start relative z-10 gap-6 md:gap-8">
          <motion.div
            className="flex flex-col gap-3 sm:gap-4 md:text-left max-w-xs sm:max-w-none shrink-0"
            initial={{ opacity: 0, y: 60 }}
            animate={{
              opacity: isInView ? 1 : 0,
              y: isInView ? 0 : 60,
            }}
            transition={{
              duration: 0.8,
              ease: easeOut,
            }}
            style={{ y }}
          >
            <FooterBrandContent isInView={isInView} />
          </motion.div>

          <motion.div
            className="flex justify-start sm:justify-center sm:flex-1 shrink-0"
            initial={{ opacity: 0, y: 60 }}
            animate={{
              opacity: isInView ? 1 : 0,
              y: isInView ? 0 : 60,
            }}
            transition={{
              duration: 0.8,
              ease: easeOut,
              delay: 0.4,
            }}
            style={{ scale }}
          >
            {linkSections.map((section, index) => (
              <LinkSection key={index} title={section.title} items={section.items} index={index} />
            ))}
          </motion.div>

          <FooterSocials isInView={isInView} />
        </section>

        <FooterCopyright isInView={isInView} />
        <ToastContainer position="top-center" autoClose={3000} />
      </div>
    </>
  );
};

export default Footer;
