// "use client";
// import { useRef, useState, useCallback } from "react";
// import html2canvas from "html2canvas";

// export interface CursorPosition {
//   x: number;
//   y: number;
//   timestamp: number;
// }

// export interface ClickEvent {
//   x: number;
//   y: number;
//   timestamp: number;
//   elementText?: string;
//   elementId?: string;
// }

// export interface Slide {
//   id: string;
//   timestamp: number;
//   imageData: string;
//   clicks: ClickEvent[];
//   description: string;
//   title: string;
// }

// export interface RecordingSession {
//   id: string;
//   slides: Slide[];
//   duration: number;
//   startTime: number;
// }

// export const useInteractionRecorder = () => {
//   const [recording, setRecording] = useState(false);
//   const [slides, setSlides] = useState<Slide[]>([]);
//   const clicksRef = useRef<ClickEvent[]>([]);
//   const recordingStartTimeRef = useRef<number>(0);
//   const screenshotIntervalRef = useRef<NodeJS.Timeout | null>(null);
//   const pendingCapturesRef = useRef<Promise<void>[]>([]);
//   const listenerRefsRef = useRef<{
//     handleClick?: (e: MouseEvent) => void;
//     captureHandler?: () => Promise<void>;
//   }>({});

//   const captureVisibleArea = useCallback(async () => {
//     try {
//       console.log("Starting capture...");
//       const element = document.documentElement;
//       const width = window.innerWidth;
//       const height = window.innerHeight;

//       const canvas = await html2canvas(element, {
//         width,
//         height,
//         x: 0,
//         y: 0,
//         windowWidth: width,
//         windowHeight: height,
//         allowTaint: true,
//         useCORS: true,
//         foreignObjectRendering: true,
//         backgroundColor: null,
//       });

//       const dataUrl = canvas.toDataURL("image/png");
//       console.log("Capture successful, size:", dataUrl.length);
//       return dataUrl;
//     } catch (error) {
//       console.error("html2canvas failed:", error);
//       const canvas = document.createElement("canvas");
//       canvas.width = window.innerWidth;
//       canvas.height = window.innerHeight;
//       const ctx = canvas.getContext("2d");
//       if (ctx) {
//         ctx.fillStyle = "#f0f0f0";
//         ctx.fillRect(0, 0, canvas.width, canvas.height);
//         ctx.fillStyle = "#000";
//         ctx.font = "20px Arial";
//         ctx.fillText("Screenshot Placeholder", 20, 50);
//         ctx.fillText(`Captured at ${new Date().toLocaleTimeString()}`, 20, 100);
//         const fallbackUrl = canvas.toDataURL("image/png");
//         console.log("Using fallback screenshot");
//         return fallbackUrl;
//       }
//       return null;
//     }
//   }, []);

//   const startRecording = useCallback(() => {
//     setRecording(true);
//     clicksRef.current = [];
//     pendingCapturesRef.current = [];
//     recordingStartTimeRef.current = Date.now();
//     setSlides([]);

//     const captureHandler = async () => {
//       try {
//         const imageData = await captureVisibleArea();
//         if (!imageData) {
//           console.warn("No image data captured");
//           return;
//         }

//         const now = Date.now();
//         const timestamp = now - recordingStartTimeRef.current;

//         const newSlide: Slide = {
//           id: `slide-${Date.now()}`,
//           timestamp,
//           imageData,
//           clicks: [...clicksRef.current],
//           title: `Step ${Date.now()}`,
//           description:
//             clicksRef.current.length > 0
//               ? `Clicked ${clicksRef.current.length} element(s)`
//               : "Capture point",
//         };

//         console.log("Adding slide:", newSlide.id);
//         setSlides((prev) => [...prev, newSlide]);
//         clicksRef.current = [];
//       } catch (error) {
//         console.error("Error in captureHandler:", error);
//       }
//     };

//     const handleClick = (e: MouseEvent) => {
//       console.log("Click detected at:", e.clientX, e.clientY);
//       const target = e.target as HTMLElement;
//       const now = Date.now();
//       clicksRef.current.push({
//         x: e.clientX,
//         y: e.clientY,
//         timestamp: now - recordingStartTimeRef.current,
//         elementText: target.textContent?.substring(0, 50) || "",
//         elementId: target.id,
//       });
//       const capturePromise = captureHandler();
//       pendingCapturesRef.current.push(capturePromise);
//     };

//     document.addEventListener("click", handleClick);
//     window.addEventListener("hashchange", captureHandler);
//     window.addEventListener("popstate", captureHandler);

//     listenerRefsRef.current = {
//       handleClick,
//       captureHandler,
//     };
//   }, [captureVisibleArea]);

//   const stopRecording = useCallback(async () => {
//     setRecording(false);

//     if (screenshotIntervalRef.current) {
//       clearInterval(screenshotIntervalRef.current);
//     }

//     if (listenerRefsRef.current.handleClick) {
//       document.removeEventListener("click", listenerRefsRef.current.handleClick);
//     }

//     if (listenerRefsRef.current.captureHandler) {
//       window.removeEventListener("hashchange", listenerRefsRef.current.captureHandler);
//       window.removeEventListener("popstate", listenerRefsRef.current.captureHandler);
//     }

//     await Promise.all(pendingCapturesRef.current);
//     pendingCapturesRef.current = [];

//     const duration = Date.now() - recordingStartTimeRef.current;

//     return {
//       slides,
//       duration,
//     };
//   }, [slides]);

//   const addManualSlide = useCallback(
//     async (title: string, description: string) => {
//       const imageData = await captureVisibleArea();
//       if (!imageData) {
//         return;
//       }

//       const now = Date.now();
//       const timestamp = now - recordingStartTimeRef.current;

//       const newSlide: Slide = {
//         id: `slide-${slides.length}`,
//         timestamp,
//         imageData,
//         clicks: [...clicksRef.current],
//         title,
//         description,
//       };

//       setSlides((prev) => [...prev, newSlide]);
//       clicksRef.current = [];
//     },
//     [slides.length, captureVisibleArea]
//   );

//   const updateSlide = useCallback((slideId: string, updates: Partial<Slide>) => {
//     setSlides((prev) =>
//       prev.map((slide) => (slide.id === slideId ? { ...slide, ...updates } : slide))
//     );
//   }, []);

//   const deleteSlide = useCallback((slideId: string) => {
//     setSlides((prev) => prev.filter((slide) => slide.id !== slideId));
//   }, []);

//   const reset = useCallback(() => {
//     setSlides([]);
//     clicksRef.current = [];
//     pendingCapturesRef.current = [];
//     setRecording(false);
//     if (screenshotIntervalRef.current) {
//       clearInterval(screenshotIntervalRef.current);
//     }
//   }, []);

//   return {
//     recording,
//     slides,
//     startRecording,
//     stopRecording,
//     reset,
//     addManualSlide,
//     updateSlide,
//     deleteSlide,
//     captureVisibleArea,
//   };
// };
