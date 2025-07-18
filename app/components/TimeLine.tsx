// "use client";
// import { Stage, Layer, Rect, Line, Circle } from "react-konva";
// import { useLayoutEffect, useRef, useState } from "react";

// interface TimelineCanvasProps {
//   width: number;
//   currentTime: number;
//   duration: number;
//   zoom: number;
//   setCurrentTime: (t: number) => void;
//   setZoom: (z: number) => void;
// }

// export default function TimelineCanvas({
//   width,
//   currentTime,
//   duration,
//   zoom,
//   setCurrentTime,
//   setZoom,
// }: TimelineCanvasProps) {
//   const height = 60;
//   const timelineScale = duration > 0 ? (width / duration) * zoom : 1;
//   const playheadX = Math.max(0, Math.min(currentTime * timelineScale, width));

//   // Timeline click (seek)
//   const handleTimelineClick = (e: any) => {
//     const stage = e.target.getStage();
//     const pointer = stage.getPointerPosition();
//     if (!pointer) return;
//     const timeClicked = pointer.x / timelineScale;
//     setCurrentTime(Math.max(0, Math.min(timeClicked, duration)));
//   };

//   // Playhead drag (seek)
//   const handlePlayheadDrag = (e: any) => {
//     const x = e.target.x();
//     const time = x / timelineScale;
//     setCurrentTime(Math.max(0, Math.min(time, duration)));
//   };

//   // Zoom slider logic
//   const minZoom = 0.5;
//   const maxZoom = 5;
//   const zoomSliderHeight = 40;
//   const zoomSliderY = (height - zoomSliderHeight) / 2;
//   const zoomToSlider = (z: number) =>
//     zoomSliderY + zoomSliderHeight - ((z - minZoom) / (maxZoom - minZoom)) * zoomSliderHeight;
//   const sliderToZoom = (y: number) =>
//     minZoom + ((zoomSliderY + zoomSliderHeight - y) / zoomSliderHeight) * (maxZoom - minZoom);

//   const handleZoomSliderDrag = (e: any) => {
//     const y = Math.max(zoomSliderY, Math.min(e.target.y(), zoomSliderY + zoomSliderHeight));
//     const newZoom = sliderToZoom(y);
//     setZoom(Number(newZoom.toFixed(2)));
//   };

//   return (
//     <div className="flex items-center" style={{ position: "relative", width }}>
//       <Stage width={width} height={height} onMouseDown={handleTimelineClick}>
//         <Layer>
//           {/* Timeline bar */}
//           <Rect x={0} y={height / 2 - 8} width={width} height={16} fill="#e0e0e0" />
//           {/* Playhead line */}
//           <Line
//             points={[playheadX, 0, playheadX, height]}
//             stroke="red"
//             strokeWidth={2}
//             dash={[4, 4]}
//           />
//           {/* Playhead draggable handle */}
//           <Circle
//             x={playheadX}
//             y={height / 2}
//             radius={10}
//             fill="#e11d48"
//             draggable
//             dragBoundFunc={(pos) => ({
//               x: Math.max(0, Math.min(pos.x, width)),
//               y: height / 2,
//             })}
//             onDragMove={handlePlayheadDrag}
//             onClick={(e) => (e.cancelBubble = true)}
//             shadowBlur={5}
//           />
//         </Layer>
//       </Stage>
//       {/* Zoom slider beside timeline */}
//       <Stage width={40} height={height} style={{ marginLeft: 16 }}>
//         <Layer>
//           {/* Slider bar */}
//           <Rect
//             x={15}
//             y={zoomSliderY}
//             width={10}
//             height={zoomSliderHeight}
//             fill="#d1d5db"
//             cornerRadius={5}
//           />
//           {/* Draggable zoom handle */}
//           <Circle
//             x={20}
//             y={zoomToSlider(zoom)}
//             radius={10}
//             fill="#2563eb"
//             draggable
//             dragBoundFunc={(pos) => ({
//               x: 20,
//               y: Math.max(zoomSliderY, Math.min(pos.y, zoomSliderY + zoomSliderHeight)),
//             })}
//             onDragMove={handleZoomSliderDrag}
//             shadowBlur={5}
//           />
//         </Layer>
//       </Stage>
//       {/* Zoom value label */}
//       <div style={{
//         position: "absolute",
//         left: width + 56,
//         top: height / 2 - 10,
//         fontSize: 14,
//         color: "#2563eb"
//       }}>
//         Zoom: {zoom.toFixed(2)}x
//       </div>
//     </div>
//   );
// }
