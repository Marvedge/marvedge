"use client";

import React, { useRef, useState } from "react";
import "react-toastify/dist/ReactToastify.css";
import { ToastContainer, toast } from "react-toastify";
import Image from "next/image";
import {
  motion,
  useInView,
  easeOut,
  useScroll,
  useTransform,
} from "framer-motion";

const socialIcons = [
  {
    image: "/Icon(1).png",
    label: "Twitter",
    url: "https://twitter.com/marvedgemedia",
  },
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
    title: "Company",
    items: ["About Us", "Blog"],
  },
];

const SocialIcon: React.FC<{
  image: string;
  index: number;
  url: string;
  label: string;
}> = ({ image, index, url, label }) => {
  const iconRef = useRef<HTMLDivElement>(null);
  // Set `once: true` to trigger only once when icon enters viewport
  const isInView = useInView(iconRef, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={iconRef}
      className="rounded-[2rem] w-20 h-14 sm:w-24 sm:h-16 md:w-[96px] md:h-[72px] bg-white/5 hover:bg-white/10 backdrop-blur-sm transition flex items-center justify-center overflow-hidden shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
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
    </motion.div>
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

// COMMENTED OUT - Contact Form Component (keeping for potential reuse)
// const ContactForm: React.FC = () => {
//   const formRef = useRef<HTMLDivElement>(null);
//   // Set `once: true` to trigger only once when form enters viewport
//   const isInView = useInView(formRef, { once: true, margin: "-50px" });
//   const [form, setForm] = useState({
//     email: "",
//     name: "",
//     message: "",
//   });
//
//   const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
//     setForm({ ...form, [e.target.name]: e.target.value });
//   };
//
//   const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
//     e.preventDefault();
//
//     const { email, name, message } = form;
//
//     const res = await fetch("/api/contact", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({ email, name, message }),
//     });
//
//     const result = await res.json();
//     if (res.ok) {
//       toast.success("Message sent successfully!");
//       setForm({ email: "", name: "", message: "" });
//     } else {
//       toast.error(result.error || "Failed to send message.");
//     }
//   };
//
//   return (
//     <motion.div
//       ref={formRef}
//       className="bg-[#3c3160] rounded-xl p-6 sm:p-8 shadow-lg w-full"
//       initial={{ opacity: 0, y: 40 }}
//       animate={{
//         opacity: isInView ? 1 : 0,
//         y: isInView ? 0 : 40,
//       }}
//       transition={{ duration: 0.8, ease: easeOut }}
//       whileHover={{
//         y: -5,
//         boxShadow: "0 20px 40px rgba(60, 49, 96, 0.3)",
//       }}
//     >
//       <h2 className="text-white text-xl sm:text-2xl font-semibold mb-4">Get In Touch</h2>
//       <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
//         {[
//           { type: "email", placeholder: "Your Email", name: "email" },
//           { type: "text", placeholder: "Full Name", name: "name" },
//           { placeholder: "Your Message", isTextarea: true, name: "message" },
//         ].map((input, index) => (
//           <motion.div
//             key={index}
//             initial={{ opacity: 0, x: -20 }}
//             animate={{
//               opacity: isInView ? 1 : 0,
//               x: isInView ? 0 : -20,
//             }}
//             transition={{
//               duration: 0.5,
//               ease: easeOut,
//               delay: index * 0.1,
//             }}
//           >
//             {input.isTextarea ? (
//               <motion.textarea
//                 name={input.name}
//                 placeholder={input.placeholder}
//                 value={form[input.name as keyof typeof form]}
//                 onChange={handleChange}
//                 rows={4}
//                 className="bg-[#4b406a] text-white w-full placeholder:text-gray-300 rounded-lg px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#a68cff] resize-none"
//                 whileFocus={{
//                   scale: 1.02,
//                   boxShadow: "0 0 20px rgba(166, 140, 255, 0.2)",
//                 }}
//               />
//             ) : (
//               <motion.input
//                 type={input.type}
//                 name={input.name}
//                 placeholder={input.placeholder}
//                 value={form[input.name as keyof typeof form]}
//                 onChange={handleChange}
//                 className="bg-[#4b406a] text-white w-full placeholder:text-gray-300 rounded-lg px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#a68cff]"
//                 whileFocus={{
//                   scale: 1.02,
//                   boxShadow: "0 0 20px rgba(166, 140, 255, 0.2)",
//                 }}
//               />
//             )}
//           </motion.div>
//         ))}
//         <motion.button
//           type="submit"
//           className="flex cursor-pointer items-center justify-center gap-2 bg-[#a68cff] text-white font-semibold rounded-lg py-2 mt-2 text-sm sm:text-base hover:bg-[#8a6ec5] transition"
//           whileHover={{
//             scale: 1.05,
//             boxShadow: "0 10px 25px rgba(166, 140, 255, 0.3)",
//             y: -2,
//           }}
//           whileTap={{ scale: 0.95 }}
//           initial={{ opacity: 0, y: 20 }}
//           animate={{
//             opacity: isInView ? 1 : 0,
//             y: isInView ? 0 : 20,
//           }}
//           transition={{ duration: 0.5, ease: easeOut, delay: 0.4 }}
//         >
//           Send Message
//           <Image
//             src="/icons/msg.svg"
//             alt="Notifications"
//             width={20}
//             height={20}
//             className="w-5 h-5 sm:w-6 sm:h-6 invert brightness-0"
//           />
//         </motion.button>
//       </form>
//     </motion.div>
//   );
// };

const WaitlistSection: React.FC = () => {
  const formRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(formRef, { once: true, margin: "-50px" });
  const [form, setForm] = useState({
    email: "",
    name: "",
    message: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
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
    <div className="w-full bg-white pt-6 sm:pt-8 pb-12 sm:pb-16 px-3 sm:px-4 md:px-6 lg:px-8">
      <motion.div
        ref={formRef}
        className="max-w-2xl mx-auto text-center"
        initial={{ opacity: 0, y: 60 }}
        animate={{
          opacity: isInView ? 1 : 0,
          y: isInView ? 0 : 60,
        }}
        transition={{ duration: 0.8, ease: easeOut }}
      >
        {/* Early Access Label */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{
            opacity: isInView ? 1 : 0,
            y: isInView ? 0 : 20,
          }}
          transition={{ duration: 0.5, ease: easeOut }}
        >
          <p className="text-transparent bg-clip-text bg-linear-to-r from-[#261753] via-[#6B4CAF] to-[#8A76FC] text-sm sm:text-lg md:text-xl font-semibold tracking-widest uppercase mb-3 sm:mb-4">
            Get Early Access
          </p>
        </motion.div>

        {/* Title */}
        <motion.h2
          className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-[#2d2347] mb-3 sm:mb-4"
          style={{ fontFamily: "var(--font-raleway)" }}
          initial={{ opacity: 0, y: 20 }}
          animate={{
            opacity: isInView ? 1 : 0,
            y: isInView ? 0 : 20,
          }}
          transition={{ duration: 0.6, ease: easeOut, delay: 0.1 }}
        >
          Join Our <span className="text-[#8A76FC]/70">Waitlist</span>
        </motion.h2>

        {/* Description */}
        <motion.p
          className="text-[#666666] text-sm sm:text-base md:text-lg mb-6 sm:mb-8 px-2 sm:px-0"
          style={{ fontFamily: "var(--font-raleway)" }}
          initial={{ opacity: 0, y: 20 }}
          animate={{
            opacity: isInView ? 1 : 0,
            y: isInView ? 0 : 20,
          }}
          transition={{ duration: 0.6, ease: easeOut, delay: 0.2 }}
        >
          Be among the first to access Marvedge and transform your videos to eye
          catchy demo
        </motion.p>

        {/* Form */}
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
          {[
            {
              type: "email",
              placeholder: "Enter Your Email address",
              name: "email",
            },
            { type: "text", placeholder: "Enter Your Full Name", name: "name" },
            {
              placeholder: "Enter Your Message",
              isTextarea: true,
              name: "message",
            },
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
                  whileFocus={{
                    scale: 1.02,
                    boxShadow: "0 0 20px rgba(140, 91, 255, 0.2)",
                  }}
                />
              )}
            </motion.div>
          ))}

          {/* Submit Button */}
          <motion.button
            type="submit"
            className="bg-[#8C5BFF] text-white font-semibold rounded-lg py-3 text-sm sm:text-base hover:bg-[#7a4fcf] transition cursor-pointer"
            whileHover={{
              scale: 1.05,
              boxShadow: "0 10px 25px rgba(140, 91, 255, 0.3)",
            }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{
              opacity: isInView ? 1 : 0,
              y: isInView ? 0 : 20,
            }}
            transition={{ duration: 0.6, ease: easeOut, delay: 0.6 }}
          >
            Join the waitlist
          </motion.button>
        </motion.form>
      </motion.div>
    </div>
  );
};

const Footer: React.FC = () => {
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
    <>
      <WaitlistSection />
      <div
        ref={sectionRef}
        className="w-full bg-[#2d2347] min-h-[40vh] relative overflow-hidden"
      >
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

        <section className="w-full max-w-7xl mx-auto py-6 sm:py-8 px-3 sm:px-4 md:px-6 lg:px-8 flex flex-row flex-wrap sm:flex-nowrap sm:justify-between sm:items-start relative z-10 gap-6 md:gap-8">
          {/* Left: Logo and Description */}
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
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Image
                  src="/images/Transparent logo.png"
                  alt="Marvedge Logo"
                  width={32}
                  height={32}
                  className="w-8 h-8 sm:w-9 sm:h-9 object-contain"
                />
                <h2
                  className="text-white text-lg sm:text-xl md:text-2xl font-semibold"
                  style={{ fontFamily: "var(--font-raleway)" }}
                >
                  MARVEDGE
                </h2>
              </div>
              <p
                className="text-gray-300 text-xs sm:text-sm md:text-base max-w-xs sm:max-w-sm"
                style={{ fontFamily: "var(--font-raleway)" }}
              >
                Transform your product URLs into compelling demo videos with the
                power of AI. Boost conversations and save time with automated
                video creation.
              </p>
            </motion.div>
          </motion.div>

          {/* Middle: Company Links */}
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
              <LinkSection
                key={index}
                title={section.title}
                items={section.items}
                index={index}
              />
            ))}
          </motion.div>

          {/* Right: Social Icons */}
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
                <SocialIcon
                  key={index}
                  image={icon.image}
                  index={index}
                  url={icon.url}
                  label={icon.label}
                />
              ))}
            </motion.div>
          </motion.div>
        </section>

        <motion.footer
          className="w-full flex flex-col items-center pt-2 sm:pt-3 pb-0 px-3 sm:px-4 absolute bottom-10 left-0 right-0 z-10"
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
            Copyright © 2025. All rights reserved. Created with 🩶 for better
            conversation.
          </motion.p>
        </motion.footer>
        <ToastContainer position="top-center" autoClose={3000} />
      </div>
    </>
  );
};

export default Footer;
