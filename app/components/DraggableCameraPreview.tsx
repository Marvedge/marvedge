import { useRef, useState, useEffect, RefObject } from "react";

const DraggableCameraPreview = ({ videoRef }: { videoRef: RefObject<HTMLVideoElement | null> }) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [dragging, setDragging] = useState(false);
  const [rel, setRel] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging) {
        return;
      }
      setPosition({
        x: e.clientX - rel.x,
        y: e.clientY - rel.y,
      });
    };

    const handleMouseUp = () => setDragging(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, rel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!previewRef.current) {
      return;
    }
    const rect = previewRef.current.getBoundingClientRect();
    setDragging(true);
    setRel({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    e.preventDefault();
  };

  return (
    <div
      ref={previewRef}
      onMouseDown={handleMouseDown}
      className="fixed z-50 cursor-move rounded shadow bg-black"
      style={{
        left: position.x,
        top: position.y,
        width: "160px",
        height: "120px",
      }}
    >
      <video ref={videoRef} autoPlay playsInline className="w-full h-full rounded" />
    </div>
  );
};

export default DraggableCameraPreview;
