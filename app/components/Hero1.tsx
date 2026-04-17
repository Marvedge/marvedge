"use client";

import React, { useRef } from "react";
import { motion, useInView, easeOut, useScroll, useTransform } from "framer-motion";
import Image from "next/image";

interface TiltCardProps {
  title: string;
  description: string;
  icon: string;
  image: string;
  linkText?: string;
  index: number;
  bgColor?: string;
}

interface Card extends Omit<TiltCardProps, "index"> {
  icon: string;
  bgColor: string;
}

const TiltCard: React.FC<TiltCardProps> = ({
  title,
  description,
  image,
  linkText = "Learn more >",
  bgColor = "bg-gray-100",
}) => {
  return (
    <div className="bg-white rounded-lg sm:rounded-xl shadow-md sm:shadow-lg p-4 sm:p-6 md:p-8 w-full">
      <div className="flex gap-3 sm:gap-4 mb-3 sm:mb-4">
        <div
          className={`relative w-10 sm:w-12 h-10 sm:h-12 rounded-lg overflow-hidden shrink-0 flex items-center justify-center ${bgColor}`}
        >
          <Image
            src={image}
            alt={title}
            width={24}
            height={24}
            className="object-contain"
            // priority={index < 3}
          />
        </div>
      </div>
      <h3
        className="text-lg sm:text-xl md:text-2xl font-semibold text-[#494369]"
        style={{ fontFamily: "var(--font-raleway)", fontWeight: 700 }}
      >
        {title}
      </h3>
      <p
        className="mt-2 text-[#494369] text-sm sm:text-base"
        style={{ fontFamily: "var(--font-raleway)", fontWeight: 400 }}
      >
        {description}
      </p>
      <a href="#" className="mt-4 inline-block text-blue-500 text-base hover:underline">
        {linkText}
      </a>
    </div>
  );
};

const Hero1: React.FC = () => {
  const sectionRef = useRef(null);
  // Set `once: true` to trigger only once when section enters viewport
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1.05, 1]);

  const cards: Card[] = [
    {
      title: "Easy To Use",
      description:
        "Simply upload or capture your product videos and use our platform to create a professional demo video in minutes, not hours.",
      icon: "🎨",
      image: "/easy-to-use-icon 2.svg",
      bgColor: "bg-purple-100",
    },
    {
      title: "Smart Content Analysis",
      description:
        "Our platform understands your product features, benefits, and target audience to create relevant, engaging content.",
      icon: "🧠",
      image: "/icons/Group1.svg",
      bgColor: "bg-blue-100",
    },
    {
      title: "Conversion Optimized",
      description:
        "Every video is designed with proven conversion techniques to turn viewers into customers effectively.",
      icon: "📈",
      image: "/icons/Group2.svg",
      bgColor: "bg-green-100",
    },
    {
      title: "Brand Customization",
      description:
        "Automatically apply your brand colors, fonts, and style guidelines to maintain consistent branding.",
      icon: "⭐",
      image: "/icons/Group3.svg",
      bgColor: "bg-yellow-100",
    },
    {
      title: "Multi-Format Export",
      description:
        "Export videos optimized for web, social media, email campaigns, and presentations with one click.",
      icon: "📱",
      image: "/icons/Group4.svg",
      bgColor: "bg-blue-100",
    },
    {
      title: "Lightning Fast",
      description:
        "Get professional demo videos in under 2 minutes. No more waiting days for video production.",
      icon: "🚀",
      image: "/icons/Group5.svg",
      bgColor: "bg-red-100",
    },
  ];

  return (
    <section
      id="features"
      ref={sectionRef}
      className="relative overflow-hidden bg-white pt-4 sm:pt-12 md:pt-16 pb-1 sm:pb-3 md:pb-4"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 relative z-10">
        <motion.h1
          className="mt-2 max-sm:mt-2 text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight text-center"
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
          style={{ y, fontFamily: "var(--font-raleway)", fontWeight: 900 }}
        >
          <span className="text-[#494369]">Convert product into your</span>{" "}
          <span className="text-[#8A76FC]/70">Best Salesperson</span>
        </motion.h1>
        <motion.p
          className="mt-4 max-sm:mt-8 text-gray-700 text-sm sm:text-base md:text-lg max-w-2xl mx-auto text-center px-2 sm:px-0"
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
          style={{ fontFamily: "var(--font-raleway)", fontWeight: 400 }}
        >
          Every company should be able to showcase its product in action, without needing a team of
          developers, editors, designers, or salespeople.
        </motion.p>

        <motion.div
          className="mt-8 sm:mt-10 md:mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6"
          style={{ scale }}
        >
          {cards.slice(0, 3).map((card, index) => (
            <TiltCard
              key={index}
              title={card.title}
              description={card.description}
              icon={card.icon}
              image={card.image}
              index={index}
              bgColor={card.bgColor}
            />
          ))}
        </motion.div>

        <motion.div
          className="mt-8 sm:mt-10 md:mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6"
          style={{ scale }}
        >
          {cards.slice(3).map((card, index) => (
            <TiltCard
              key={index}
              title={card.title}
              description={card.description}
              icon={card.icon}
              image={card.image}
              index={index + 3}
              bgColor={card.bgColor}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default Hero1;
