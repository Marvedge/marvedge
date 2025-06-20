"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  motion,
  useAnimation,
  AnimatePresence,
  useInView,
  easeOut,
  useScroll,
  useTransform,
} from "framer-motion";
import Hero3 from "./Hero3";

interface ServiceCardProps {
  title: string;
  description: string;
  icon: string;
}

const ServiceCard: React.FC<ServiceCardProps> = ({
  title,
  description,
  icon,
}) => {
  return (
    <motion.div
      whileHover={{
        y: -10,
        boxShadow: "0 25px 50px rgba(0, 0, 0, 0.15)",
        scale: 1.02,
      }}
      className="bg-white rounded-lg py-12 px-7 shadow-lg hover:shadow-xl transition-all duration-300 w-96 lg:w-[800px] lg:h-[400px] h-80 flex flex-col items-center justify-center"
    >
      <motion.div
        className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6"
        animate={{
          rotate: [0, 10, -10, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <span className="text-3xl">{icon}</span>
      </motion.div>
      <h3 className="text-2xl font-semibold mb-3 text-center">{title}</h3>
      <p className="text-gray-600 text-center text-base">{description}</p>
    </motion.div>
  );
};

const Hero2: React.FC = () => {
  const [count, setCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const controls = useAnimation();
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: false, margin: "-100px" });
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, -30]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1.02, 1]);

  const services = [
    {
      title: "Web Development",
      description:
        "Build responsive and scalable web applications with cutting-edge technologies.",
      icon: "🌐",
    },
    {
      title: "Mobile Development",
      description:
        "Create seamless mobile experiences for iOS and Android platforms.",
      icon: "📱",
    },
    {
      title: "UI/UX Design",
      description:
        "Design intuitive and engaging user interfaces for better user experiences.",
      icon: "🎨",
    },
  ];

  useEffect(() => {
    const animateCount = async () => {
      await controls.start({
        opacity: 1,
        transition: { duration: 0.5 },
      });

      let start = 0;
      const end = 1000;
      const duration = 2000;
      const increment = end / (duration / 16);

      const timer = setInterval(() => {
        start += increment;
        if (start >= end) {
          setCount(end);
          clearInterval(timer);
        } else {
          setCount(Math.floor(start));
        }
      }, 16);

      return () => clearInterval(timer);
    };

    animateCount();
  }, [controls]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % services.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [services.length]);

  const cardVariants = {
    enter: { x: "100%", opacity: 0, scale: 0.8 },
    center: { x: 0, opacity: 1, scale: 1 },
    exit: { x: "-100%", opacity: 0, scale: 0.8 },
  };

  return (
    <section ref={sectionRef} className="relative overflow-hidden">
      <motion.div
        className="absolute bottom-1/4 right-10 w-16 h-16 bg-blue-200 rounded-full opacity-20"
        animate={{
          scale: [1, 1.3, 1],
          x: [0, 30, 0],
          rotate: [0, -180, -360],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <div className="container mx-auto px-2 sm:px-4 relative z-10">
        <motion.div
          className="text-center mb-16"
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
          <h2 className="text-3xl sm:text-5xl md:text-6xl mt-10 font-bold mb-4 text-gray-600 whitespace-nowrap">
            Trusted by{" "}
            <motion.span
              className="text-[#6B46C1]"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={controls}
              whileHover={{
                scale: 1.1,
                textShadow: "0 0 20px rgba(107, 70, 193, 0.5)",
              }}
            >
              {count}+
            </motion.span>{" "}
            Companies
          </h2>
          <motion.p
            className="text-sm sm:text-xl md:text-2xl text-gray-700 max-w-full mx-auto whitespace-nowrap"
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
            See how businesses are using DemoAI to boost their conversations
          </motion.p>
        </motion.div>

        <motion.div
          className="relative w-full h-[400px] flex items-center justify-center overflow-hidden"
          initial={{ opacity: 0, scale: 0.8, rotateZ: -10 }}
          animate={{
            opacity: isInView ? 1 : 0,
            scale: isInView ? 1 : 0.8,
            rotateZ: isInView ? 0 : -10,
          }}
          transition={{
            duration: 0.8,
            ease: easeOut,
            delay: 0.4,
          }}
          style={{ scale }}
        >
          <AnimatePresence initial={false}>
            <motion.div
              key={currentIndex}
              variants={cardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="absolute"
            >
              <ServiceCard
                title={services[currentIndex].title}
                description={services[currentIndex].description}
                icon={services[currentIndex].icon}
              />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
      <Hero3 />
    </section>
  );
};

export default Hero2;
