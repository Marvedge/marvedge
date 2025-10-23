"use client";

import React, { useRef, useState } from "react";
import "react-toastify/dist/ReactToastify.css";
import { ToastContainer, toast } from "react-toastify";
import Image from "next/image";
import { motion, useInView, easeOut, useScroll, useTransform } from "framer-motion";

const socialIcons = [
  {
    path: "M21.35 11.1c0-5.05-4.1-9.15-9.15-9.15S3.05 6.05 3.05 11.1c0 4.56 3.3 8.34 7.62 9.06v-6.41h-2.3v-2.65h2.3V9.41c0-2.27 1.35-3.53 3.42-3.53.99 0 2.03.18 2.03.18v2.23h-1.14c-1.13 0-1.48.7-1.48 1.42v1.7h2.52l-.4 2.65h-2.12v6.41c4.32-.72 7.62-4.5 7.62-9.06z",
  },
  {
    path: "M22.46 6c-.77.35-1.6.59-2.47.7a4.3 4.3 0 001.88-2.37 8.59 8.59 0 01-2.72 1.04A4.28 4.28 0 0016.11 4c-2.37 0-4.29 1.92-4.29 4.29 0 .34.04.67.11.99C7.69 9.13 4.07 7.38 1.64 4.7c-.37.64-.58 1.38-.58 2.17 0 1.5.76 2.82 1.92 3.6-.7-.02-1.36-.21-1.94-.53v.05c0 2.1 1.5 3.85 3.5 4.25-.36.1-.74.16-1.13.16-.28 0-.54-.03-.8-.08.54 1.7 2.1 2.94 3.95 2.97A8.6 8.6 0 012 19.54a12.13 12.13 0 006.56 1.92c7.88 0 12.2-6.53 12.2-12.2 0-.19 0-.37-.01-.56A8.7 8.7 0 0024 4.59a8.48 8.48 0 01-2.54.7z",
  },
  {
    path: "M12 2.04c-5.5 0-9.96 4.46-9.96 9.96 0 4.41 3.6 8.07 8.06 8.93v-6.32h-2.43v-2.61h2.43V9.41c0-2.4 1.46-3.71 3.62-3.71 1.05 0 2.15.19 2.15.19v2.36h-1.21c-1.19 0-1.56.74-1.56 1.5v1.8h2.66l-.43 2.61h-2.23v6.32c4.46-.86 8.06-4.52 8.06-8.93 0-5.5-4.46-9.96-9.96-9.96z",
  },
  {
    path: "M19.99 3.01H4.01C2.9 3.01 2 3.91 2 5.02v13.96c0 1.11.9 2.01 2.01 2.01h15.98c1.11 0 2.01-.9 2.01-2.01V5.02c0-1.11-.9-2.01-2.01-2.01zm-9.99 14.99H5.99V9.99h4.01v8.01zm-2-9.01c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm13 9.01h-4.01v-4.01c0-.99-.01-2.26-1.38-2.26-1.38 0-1.59 1.08-1.59 2.19v4.08h-4.01V9.99h3.85v1.37h.05c.54-1.02 1.85-2.09 3.81-2.09 4.08 0 4.83 2.69 4.83 6.19v6.54z",
  },
];

const linkSections = [
  {
    title: "Company",
    items: ["About Us", "FAQ", "Blog", "Pricing", "Privacy Policy"],
  },
  {
    title: "Services",
    items: ["Product Demo", "Design", "Documentation Video"],
  },
  {
    title: "Contact Us",
    items: ["Help Centre", "Terms Of Service"],
  },
  {
    title: "More",
    items: ["Documentation", "License"],
  },
];

const SocialIcon: React.FC<{ path: string; index: number }> = ({ path, index }) => {
  const iconRef = useRef<HTMLSpanElement>(null);
  // Set `once: true` to trigger only once when icon enters viewport
  const isInView = useInView(iconRef, { once: true, margin: "-50px" });

  return (
    <motion.span
      ref={iconRef}
      className="bg-[#3c3160] rounded-full p-2.5 text-white hover:bg-[#a68cff] transition"
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{
        opacity: isInView ? 1 : 0,
        scale: isInView ? 1 : 0.8,
        y: isInView ? 0 : 20,
      }}
      transition={{
        duration: 0.5,
        ease: easeOut,
        delay: index * 0.1,
      }}
      whileHover={{
        scale: 1.1,
        boxShadow: "0 10px 20px rgba(166, 140, 255, 0.3)",
        y: -5,
      }}
      whileTap={{ scale: 0.9 }}
    >
      <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d={path} />
      </svg>
    </motion.span>
  );
};

const LinkSection: React.FC<{
  title: string;
  items: string[];
  index: number;
}> = ({ title, items, index }) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  // Set `once: true` to trigger only once when section enters viewport
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
      <h3 className="text-white font-semibold mb-2 text-base sm:text-lg">{title}</h3>
      <ul className="text-gray-300 space-y-1.5 text-sm sm:text-base">
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

const ContactForm: React.FC = () => {
  const formRef = useRef<HTMLDivElement>(null);
  // Set `once: true` to trigger only once when form enters viewport
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
    <motion.div
      ref={formRef}
      className="bg-[#3c3160] rounded-xl p-6 sm:p-8 shadow-lg w-full"
      initial={{ opacity: 0, y: 40 }}
      animate={{
        opacity: isInView ? 1 : 0,
        y: isInView ? 0 : 40,
      }}
      transition={{ duration: 0.8, ease: easeOut }}
      whileHover={{
        y: -5,
        boxShadow: "0 20px 40px rgba(60, 49, 96, 0.3)",
      }}
    >
      <h2 className="text-white text-xl sm:text-2xl font-semibold mb-4">Get In Touch</h2>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        {[
          { type: "email", placeholder: "Your Email", name: "email" },
          { type: "text", placeholder: "Full Name", name: "name" },
          { placeholder: "Your Message", isTextarea: true, name: "message" },
        ].map((input, index) => (
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
              delay: index * 0.1,
            }}
          >
            {input.isTextarea ? (
              <motion.textarea
                name={input.name}
                placeholder={input.placeholder}
                value={form[input.name as keyof typeof form]}
                onChange={handleChange}
                rows={4}
                className="bg-[#4b406a] text-white w-full placeholder:text-gray-300 rounded-lg px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#a68cff] resize-none"
                whileFocus={{
                  scale: 1.02,
                  boxShadow: "0 0 20px rgba(166, 140, 255, 0.2)",
                }}
              />
            ) : (
              <motion.input
                type={input.type}
                name={input.name}
                placeholder={input.placeholder}
                value={form[input.name as keyof typeof form]}
                onChange={handleChange}
                className="bg-[#4b406a] text-white w-full placeholder:text-gray-300 rounded-lg px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#a68cff]"
                whileFocus={{
                  scale: 1.02,
                  boxShadow: "0 0 20px rgba(166, 140, 255, 0.2)",
                }}
              />
            )}
          </motion.div>
        ))}
        <motion.button
          type="submit"
          className="flex cursor-pointer items-center justify-center gap-2 bg-[#a68cff] text-white font-semibold rounded-lg py-2 mt-2 text-sm sm:text-base hover:bg-[#8a6ec5] transition"
          whileHover={{
            scale: 1.05,
            boxShadow: "0 10px 25px rgba(166, 140, 255, 0.3)",
            y: -2,
          }}
          whileTap={{ scale: 0.95 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{
            opacity: isInView ? 1 : 0,
            y: isInView ? 0 : 20,
          }}
          transition={{ duration: 0.5, ease: easeOut, delay: 0.4 }}
        >
          Send Message
          <Image
            src="/icons/msg.svg"
            alt="Notifications"
            width={20}
            height={20}
            className="w-5 h-5 sm:w-6 sm:h-6 invert brightness-0"
          />
        </motion.button>
      </form>
    </motion.div>
  );
};

const Hero4: React.FC = () => {
  const sectionRef = useRef(null);
  // Set `once: true` to trigger only once when section enters viewport
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, -30]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1.01, 1]);

  return (
    <div ref={sectionRef} className="w-full bg-[#2d2347] min-h-screen relative overflow-hidden">
      <motion.div
        className="absolute top-20 left-1/4 w-32 h-32 bg-purple-900 rounded-full opacity-10"
        animate={{
          scale: [1, 1.2, 1],
          rotate: [0, 180, 360],
          x: [0, 50, 0],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "linear",
        }}
      />
      <motion.div
        className="absolute bottom-20 right-1/3 w-24 h-24 bg-purple-900 rounded-full opacity-10"
        animate={{
          scale: [1, 1.3, 1],
          y: [0, -40, 0],
          rotate: [0, -180, -360],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <section className="w-full max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row md:gap-12 relative z-10">
        <motion.div
          className="flex flex-col w-full md:w-1/3 gap-8 mb-8 md:mb-0"
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
            <div className="flex items-center space-x-3 mb-4">
              <Image
                src="/images/Transparent logo.png"
                alt="Marvedge logo"
                width={80}
                height={80}
                className="w-12 h-12 md:w-16 md:h-16 object-contain"
                priority
              />
              <span className="text-[#8C5BFF] text-xl md:text-2xl font-semibold">Marvedge</span>
            </div>
            <p className="text-gray-300 text-sm sm:text-base">
              Transform your product URLs into compelling demo videos with the power of AI. Boost
              conversations and save time with automated video creation.
            </p>
          </motion.div>

          <ContactForm />
        </motion.div>

        <motion.div
          className="flex-1 w-full"
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
            {linkSections.map((section, index) => (
              <LinkSection key={index} title={section.title} items={section.items} index={index} />
            ))}
          </div>
        </motion.div>
      </section>

      <motion.footer
        className="w-full flex flex-col items-center py-6 px-4 relative z-10"
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
          className="flex justify-center gap-3 sm:gap-4"
          initial={{ opacity: 0, y: 30 }}
          animate={{
            opacity: isInView ? 1 : 0,
            y: isInView ? 0 : 30,
          }}
          transition={{
            duration: 0.8,
            ease: easeOut,
            delay: 0.8,
          }}
        >
          {socialIcons.map((icon, index) => (
            <SocialIcon key={index} path={icon.path} index={index} />
          ))}
        </motion.div>

        <motion.p
          className="text-gray-300 text-xs sm:text-sm font-semibold mt-4 text-center"
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
          Copyright © 2025. All rights reserved. Created with 🩶 for better conversation.
        </motion.p>
      </motion.footer>
      <ToastContainer position="top-center" autoClose={3000} />
    </div>
  );
};

export default Hero4;
