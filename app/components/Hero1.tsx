"use client";

import React, { useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useInView,
  easeOut,
  useScroll,
  useTransform,
} from "framer-motion";
import Image from "next/image";

interface TiltCardProps {
  title: string;
  description: string;
  icon: string;
  image: string;
  linkText?: string;
  index: number;
}

const TiltCard: React.FC<TiltCardProps> = ({
  title,
  description,
  image,
  linkText = "Learn more →",
  index,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springConfig = { stiffness: 300, damping: 30 };
  const rotateX = useSpring(x, springConfig);
  const rotateY = useSpring(y, springConfig);
  // Set `once: true` to trigger only once when card enters viewport
  const isInView = useInView(cardRef, { once: true, margin: "-50px" });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) {
      return;
    }
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;
    const maxTilt = 20;
    const tiltX = -(mouseY / (rect.height / 2)) * maxTilt;
    const tiltY = (mouseX / (rect.width / 2)) * maxTilt;
    x.set(tiltX);
    y.set(tiltY);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      className="bg-white rounded-xl shadow-lg p-8 text-center w-full"
      style={{
        perspective: 1000,
        rotateX,
        rotateY,
        boxShadow: `${rotateY.get() * 0.1}px ${rotateX.get() * 0.1}px ${
          10 + Math.abs(rotateX.get()) * 0.2 + Math.abs(rotateY.get()) * 0.2
        }px rgba(0, 0, 0, 0.2)`,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={{
        scale: 1.05,
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.15)",
        y: -10,
      }}
      initial={{ opacity: 0, y: 60, scale: 0.9, rotateX: -15 }}
      animate={{
        opacity: isInView ? 1 : 0,
        y: isInView ? 0 : 60,
        scale: isInView ? 1 : 0.9,
        rotateX: isInView ? 0 : -15,
      }}
      transition={{
        duration: 0.8,
        ease: easeOut,
        delay: index * 0.1,
      }}
    >
      <motion.div
        className="relative w-16 h-16 mx-auto mb-4 rounded-lg overflow-hidden"
        // Changed to one-time animation triggered by isInView
        initial={{ rotate: 0, scale: 0.8 }}
        animate={{
          rotate: isInView ? 0 : 0,
          scale: isInView ? 1 : 0.8,
        }}
        transition={{
          duration: 0.8,
          ease: easeOut,
        }}
      >
        <Image
          src={image}
          alt={title}
          fill
          className="object-contain"
          sizes="64px"
          priority={index < 3}
        />
      </motion.div>
      <div className="relative w-full h-32 mb-4"></div>
      <h3 className="text-2xl font-semibold text-gray-800">{title}</h3>
      <p className="mt-2 text-gray-600 text-base">{description}</p>
      <motion.a
        href="#"
        className="mt-4 inline-block text-[#6B46C1] text-base hover:underline"
        whileHover={{ x: 5, scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {linkText}
      </motion.a>
    </motion.div>
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

  const cards = [
    {
      title: "URL to Video Magic",
      description:
        "Simply paste your product URL and watch our AI create a professional demo video in minutes, not hours.",
      icon: "🔗",
      image: "/icons/Group.svg",
    },
    {
      title: "Smart Content Analysis",
      description:
        "Our AI understands your product features, benefits, and target audience to create relevant, engaging content.",
      icon: "⚡",
      image: "/icons/Group1.svg",
    },
    {
      title: "Conversion Optimized",
      description:
        "Every video is designed with proven conversion techniques to turn viewers into customers effectively.",
      icon: "📈",
      image: "/icons/Group2.svg",
    },
    {
      title: "Brand Customization",
      description:
        "Automatically apply your brand colors, fonts, and style guidelines to maintain consistent branding.",
      icon: "🎥",
      image: "/icons/Group3.svg",
    },
    {
      title: "Multi-Format Export",
      description:
        "Export videos optimized for web, social media, email campaigns, and presentations with one click.",
      icon: "⚡",
      image: "/icons/Group4.svg",
    },
    {
      title: "Lightning Fast",
      description:
        "Get professional demo videos in under 2 minutes. No more waiting days for video production.",
      icon: "👥",
      image: "/icons/Group5.svg",
    },
  ];

  return (
    <section ref={sectionRef} className="relative overflow-hidden">
      <motion.div
        className="absolute bottom-20 right-1/3 w-24 h-24 bg-blue-100 rounded-full opacity-30"
        animate={{
          scale: [1, 1.4, 1],
          y: [0, -30, 0],
          rotate: [0, -180, -360],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <motion.h1
          className="mt-6 max-sm:mt-10 text-3xl md:text-4xl font-extrabold text-gray-600 leading-tight text-center"
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
          style={{ y }}
        >
          Automated Video Creation <span className="text-[#6B46C1]">Powered by AI</span>
        </motion.h1>
        <motion.p
          className="mt-4 max-sm:mt-8 text-gray-600 text-lg max-w-2xl mx-auto text-center translate-x-2 sm:translate-x-4 md:translate-x-6"
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
          Our advanced AI technology analyzes your product, understands your audience, and creates
          compelling demo videos that drive conversions automatically.
        </motion.p>

        <motion.div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6" style={{ scale }}>
          {cards.slice(0, 3).map((card, index) => (
            <TiltCard
              key={index}
              title={card.title}
              description={card.description}
              icon={card.icon}
              image={card.image}
              index={index}
            />
          ))}
        </motion.div>

        <motion.div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6" style={{ scale }}>
          {cards.slice(3).map((card, index) => (
            <TiltCard
              key={index}
              title={card.title}
              description={card.description}
              icon={card.icon}
              image={card.image}
              index={index + 3} // Adjust index for staggered delay
            />
          ))}
        </motion.div>

        <motion.div
          className="mt-20 bg-white rounded-xl shadow-lg p-6 flex flex-col md:flex-row items-center justify-between gap-6"
          initial={{ opacity: 0, y: 60, scale: 0.9 }}
          animate={{
            opacity: isInView ? 1 : 0,
            y: isInView ? 0 : 60,
            scale: isInView ? 1 : 0.9,
          }}
          transition={{
            duration: 0.8,
            ease: easeOut,
            delay: 0.6,
          }}
          whileHover={{
            boxShadow: "0 25px 50px rgba(0, 0, 0, 0.1)",
            y: -5,
          }}
        >
          <div className="max-w-md">
            <h2 className="text-3xl md:text-4xl font-semibold text-black leading-tight">
              See It In Action
            </h2>
            <p className="mt-4 text-gray-600 text-lg">
              Watch how our AI transforms a simple product URL into a compelling demo video that
              showcases features, benefits, and drives conversions.
            </p>
            <ul className="mt-6 space-y-2 text-gray-600">
              <li className="flex items-center">
                <span className="mr-2 text-green-600">✔</span> Automatic feature detection and
                highlighting
              </li>
              <li className="flex items-center">
                <span className="mr-2 text-green-600">✔</span> Professional voiceover and
                background music
              </li>
              <li className="flex items-center">
                <span className="mr-2 text-green-600">✔</span> Compelling call-to-action
                integration
              </li>
            </ul>
            <button className="mt-6 cursor-pointer bg-[#8a6ec5] text-white px-6 py-3 rounded-lg hover:bg-[#6B46C1] transition">
              Try it for free
            </button>
          </div>
          <div className="w-full md:w-1/2 h-[300px] bg-[#c2b3f5] rounded-lg flex items-center justify-center">
            <video
              src="/icons/1.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="w-[90%] sm:w-[85%] h-[85%] rounded-2xl object-cover"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Hero1;
