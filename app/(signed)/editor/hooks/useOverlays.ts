import { useState, useEffect, MouseEvent } from "react";
import ReactPlayer from "react-player";

export interface RectOverlay {
  type: "blur" | "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArrowOverlay {
  type: "arrow";
  x: number;
  y: number;
  x2: number;
  y2: number;
}

export interface TextOverlay {
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  font: string;
}

export type Overlay = RectOverlay | ArrowOverlay | TextOverlay;

interface UseOverlaysProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  playerRef: React.RefObject<ReactPlayer>;
  tool: "none" | "blur" | "rect" | "arrow" | "text";
  textColor: string;
  textFont: string;
}

export function useOverlays({ canvasRef, playerRef, tool, textColor, textFont }: UseOverlaysProps) {
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);

  // Canvas drawing effect
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = playerRef.current?.getInternalPlayer();
    if (!canvas || !video) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const draw = () => {
      const width = video.clientWidth;
      const height = video.clientHeight;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const item of overlays) {
        ctx.strokeStyle = "#f87171";
        ctx.lineWidth = 2;
        switch (item.type) {
          case "blur":
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.fillRect(item.x, item.y, item.w, item.h);
            break;
          case "rect":
            ctx.strokeRect(item.x, item.y, item.w, item.h);
            break;
          case "arrow":
            ctx.beginPath();
            ctx.moveTo(item.x, item.y);
            ctx.lineTo(item.x2, item.y2);
            ctx.stroke();
            break;
          case "text":
            ctx.font = item.font;
            ctx.fillStyle = item.color;
            ctx.fillText(item.text, item.x, item.y);
            break;
        }
      }

      requestAnimationFrame(draw);
    };

    draw();
  }, [overlays, canvasRef, playerRef]);

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setStartPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDrawing(true);
  };

  const handleMouseUp = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !startPos) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    let newOverlay: Overlay;

    if (tool === "arrow") {
      newOverlay = {
        type: "arrow",
        x: startPos.x,
        y: startPos.y,
        x2: endX,
        y2: endY,
      };
    } else if (tool === "text") {
      const text = prompt("Enter text:", "Sample text") || "";
      newOverlay = {
        type: "text",
        x: endX,
        y: endY,
        text,
        color: textColor,
        font: textFont,
      };
    } else if (tool === "blur" || tool === "rect") {
      newOverlay = {
        type: tool,
        x: Math.min(startPos.x, endX),
        y: Math.min(startPos.y, endY),
        w: Math.abs(endX - startPos.x),
        h: Math.abs(endY - startPos.y),
      };
    } else {
      setDrawing(false);
      setStartPos(null);
      return;
    }

    setOverlays((prev) => [...prev, newOverlay]);
    setDrawing(false);
    setStartPos(null);
  };

  const handleUndo = () => setOverlays((prev) => prev.slice(0, -1));
  const handleClear = () => setOverlays([]);
  const handleSaveOverlays = () => localStorage.setItem("videoOverlays", JSON.stringify(overlays));
  const handleLoadOverlays = () => {
    const saved = localStorage.getItem("videoOverlays");
    if (saved) {
      setOverlays(JSON.parse(saved));
    }
  };

  return {
    overlays,
    handleMouseDown,
    handleMouseUp,
    handleUndo,
    handleClear,
    handleSaveOverlays,
    handleLoadOverlays,
  };
}
