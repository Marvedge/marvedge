// "use client";
// import React, { useState } from "react";
// import { useInteractionRecorder, Slide } from "../hooks/useInteractionRecorder";
// import { SlideshowViewer } from "./SlideshowViewer";
// import { Play, Square, Download } from "lucide-react";
// import { toast } from "sonner";

// interface TutorialRecorderProps {
//   onComplete?: (slides: Slide[]) => void;
// }

// export const TutorialRecorder: React.FC<TutorialRecorderProps> = () => {
//   const {
//     recording,
//     slides,
//     startRecording,
//     stopRecording,
//     addManualSlide,
//     updateSlide,
//     deleteSlide,
//   } = useInteractionRecorder();

//   const [view, setView] = useState<"recording" | "preview">("recording");
//   const [tutorialTitle, setTutorialTitle] = useState("");
//   const [showAddSlideForm, setShowAddSlideForm] = useState(false);
//   const [newSlideTitle, setNewSlideTitle] = useState("");
//   const [newSlideDescription, setNewSlideDescription] = useState("");

//   const handleStartRecording = () => {
//     if (!tutorialTitle.trim()) {
//       toast.error("Please enter a tutorial title");
//       return;
//     }
//     startRecording();
//     toast.success("Recording started! Interact with the page to capture events.");
//   };

//   const handleStopRecording = async () => {
//     const result = await stopRecording();
//     if (result && result.slides.length > 0) {
//       setView("preview");
//       toast.success(`Recording stopped. ${result.slides.length} slides captured.`);
//     } else {
//       toast.error("No slides were captured");
//     }
//   };

//   const handleAddManualSlide = async () => {
//     if (!newSlideTitle.trim() || !newSlideDescription.trim()) {
//       toast.error("Please fill in all fields");
//       return;
//     }
//     await addManualSlide(newSlideTitle, newSlideDescription);
//     setNewSlideTitle("");
//     setNewSlideDescription("");
//     setShowAddSlideForm(false);
//     toast.success("Slide added!");
//   };

//   const handleExportSlides = () => {
//     const exportData = {
//       title: tutorialTitle,
//       slides: slides.map((slide) => ({
//         title: slide.title,
//         description: slide.description,
//         clicks: slide.clicks,
//         timestamp: slide.timestamp,
//       })),
//       exportedAt: new Date().toISOString(),
//     };

//     const dataStr = JSON.stringify(exportData, null, 2);
//     const dataBlob = new Blob([dataStr], { type: "application/json" });
//     const url = URL.createObjectURL(dataBlob);
//     const link = document.createElement("a");
//     link.href = url;
//     link.download = `${tutorialTitle.replace(/\s+/g, "-")}-slides.json`;
//     link.click();
//     URL.revokeObjectURL(url);

//     toast.success("Slides exported as JSON!");
//   };

//   const handleExportHTML = () => {
//     const htmlContent = `
// <!DOCTYPE html>
// <html lang="en">
// <head>
//   <meta charset="UTF-8">
//   <meta name="viewport" content="width=device-width, initial-scale=1.0">
//   <title>${tutorialTitle}</title>
//   <style>
//     * { margin: 0; padding: 0; box-sizing: border-box; }
//     body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
//     .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
//     h1 { color: #1f2937; margin-bottom: 30px; }
//     .slideshow { background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; }
//     .slide { display: none; padding: 30px; }
//     .slide.active { display: block; animation: fadeIn 0.3s ease-in; }
//     @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
//     .slide h2 { color: #1f2937; margin-bottom: 15px; font-size: 28px; }
//     .slide p { color: #666; line-height: 1.6; margin-bottom: 20px; font-size: 16px; }
//     .actions { background: #eff6ff; padding: 15px; border-radius: 6px; margin-top: 20px; }
//     .actions h3 { color: #1e40af; font-size: 14px; margin-bottom: 10px; }
//     .actions li { color: #1e40af; margin-left: 20px; font-size: 14px; }
//     .controls { display: flex; gap: 10px; margin-top: 20px; justify-content: center; }
//     .btn { padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
//     .btn-primary { background: #3b82f6; color: white; }
//     .btn-primary:hover { background: #2563eb; }
//     .btn-secondary { background: #e5e7eb; color: #374151; }
//     .btn-secondary:hover { background: #d1d5db; }
//     .counter { text-align: center; color: #999; margin-top: 20px; font-size: 14px; }
//     .navigation { text-align: center; margin: 20px 0; }
//     .navigation span { color: #999; margin: 0 10px; }
//   </style>
// </head>
// <body>
//   <div class="container">
//     <h1>${tutorialTitle}</h1>
//     <div class="slideshow" id="slideshow">
//       ${slides
//         .map(
//           (slide, idx) => `
//       <div class="slide ${idx === 0 ? "active" : ""}">
//         <h2>${slide.title}</h2>
//         <p>${slide.description}</p>
//         ${
//           slide.clicks.length > 0
//             ? `
//         <div class="actions">
//           <h3>Actions on this slide:</h3>
//           <ul>
//             ${slide.clicks
//               .map(
//                 (click) =>
//                   `<li>Click at (${click.x}, ${click.y})${
//                     click.elementText ? ` on "${click.elementText}"` : ""
//                   }</li>`
//               )
//               .join("")}
//           </ul>
//         </div>
//         `
//             : ""
//         }
//       </div>
//       `
//         )
//         .join("")}
//     </div>
//     <div class="controls">
//       <button class="btn btn-secondary" onclick="previousSlide()">← Previous</button>
//       <button class="btn btn-primary" onclick="nextSlide()">Next →</button>
//     </div>
//     <div class="counter">
//       Slide <span id="current">1</span> of <span id="total">${slides.length}</span>
//     </div>
//   </div>

//   <script>
//     let currentSlide = 0;
//     const slides = document.querySelectorAll('.slide');
//     const totalSlides = slides.length;

//     function updateSlide() {
//       slides.forEach((slide, idx) => {
//         slide.classList.toggle('active', idx === currentSlide);
//       });
//       document.getElementById('current').textContent = currentSlide + 1;
//     }

//     function nextSlide() {
//       if (currentSlide < totalSlides - 1) {
//         currentSlide++;
//         updateSlide();
//       }
//     }

//     function previousSlide() {
//       if (currentSlide > 0) {
//         currentSlide--;
//         updateSlide();
//       }
//     }

//     document.addEventListener('keydown', (e) => {
//       if (e.key === 'ArrowRight') nextSlide();
//       if (e.key === 'ArrowLeft') previousSlide();
//     });
//   </script>
// </body>
// </html>
//     `;

//     const blob = new Blob([htmlContent], { type: "text/html" });
//     const url = URL.createObjectURL(blob);
//     const link = document.createElement("a");
//     link.href = url;
//     link.download = `${tutorialTitle.replace(/\s+/g, "-")}-slideshow.html`;
//     link.click();
//     URL.revokeObjectURL(url);

//     toast.success("Slideshow exported as HTML!");
//   };

//   if (view === "recording") {
//     return (
//       <div className="flex flex-col gap-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg h-full">
//         <div>
//           <label className="block text-sm font-medium text-gray-700 mb-2">Tutorial Title</label>
//           <input
//             type="text"
//             value={tutorialTitle}
//             onChange={(e) => setTutorialTitle(e.target.value)}
//             placeholder="e.g., How to use the dashboard"
//             className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
//             disabled={recording}
//           />
//         </div>

//         <div className="flex gap-3">
//           {!recording ? (
//             <button
//               onClick={handleStartRecording}
//               className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[#8A76FC] text-white rounded-lg hover:bg-[#8A76FC] font-semibold"
//             >
//               <Play size={20} />
//               Start Recording
//             </button>
//           ) : (
//             <button
//               onClick={handleStopRecording}
//               className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[#8A76FC] text-white rounded-lg hover:bg-red-600 font-semibold"
//             >
//               <Square size={20} />
//               Stop Recording
//             </button>
//           )}
//         </div>

//         {recording && (
//           <div className="bg-red-50 border border-red-200 rounded-lg p-4">
//             <div className="flex items-center gap-2 text-red-700">
//               <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
//               <span className="font-semibold">Recording in progress...</span>
//             </div>
//             <p className="text-sm text-red-600 mt-2">Click on elements to capture each slide.</p>
//           </div>
//         )}

//         {slides.length > 0 && !recording && (
//           <button
//             onClick={() => setView("preview")}
//             className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold"
//           >
//             Preview Slideshow ({slides.length} slides)
//           </button>
//         )}
//       </div>
//     );
//   }

//   return (
//     <div className="flex flex-col gap-4 h-full bg-white rounded-lg">
//       <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
//         <div>
//           <h2 className="text-xl font-bold text-gray-900">{tutorialTitle}</h2>
//           <p className="text-sm text-gray-500">{slides.length} slides</p>
//         </div>
//         <div className="flex gap-2">
//           <button
//             onClick={() => setView("recording")}
//             className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
//           >
//             Back to Recording
//           </button>
//           {showAddSlideForm ? (
//             <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
//               <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
//                 <h3 className="text-lg font-bold mb-4">Add Manual Slide</h3>
//                 <input
//                   type="text"
//                   value={newSlideTitle}
//                   onChange={(e) => setNewSlideTitle(e.target.value)}
//                   placeholder="Slide title"
//                   className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
//                 />
//                 <textarea
//                   value={newSlideDescription}
//                   onChange={(e) => setNewSlideDescription(e.target.value)}
//                   placeholder="Slide description"
//                   className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
//                 />
//                 <div className="flex gap-2">
//                   <button
//                     onClick={handleAddManualSlide}
//                     className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
//                   >
//                     Add Slide
//                   </button>
//                   <button
//                     onClick={() => setShowAddSlideForm(false)}
//                     className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
//                   >
//                     Cancel
//                   </button>
//                 </div>
//               </div>
//             </div>
//           ) : null}
//         </div>
//       </div>

//       <div className="flex-1 overflow-hidden">
//         <SlideshowViewer
//           slides={slides}
//           onUpdateSlide={updateSlide}
//           onDeleteSlide={deleteSlide}
//           onAddSlide={() => setShowAddSlideForm(true)}
//         />
//       </div>

//       <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex gap-2">
//         <button
//           onClick={handleExportHTML}
//           className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold flex items-center justify-center gap-2"
//         >
//           <Download size={18} />
//           Export as Slideshow
//         </button>
//         <button
//           onClick={handleExportSlides}
//           className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 font-semibold flex items-center justify-center gap-2"
//         >
//           <Download size={18} />
//           Export as JSON
//         </button>
//       </div>
//     </div>
//   );
// };
