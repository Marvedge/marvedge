import React from "react";

interface TimelineProps {
  minValue?: number;
  maxValue?: number;
  zoomLevel?: number;
  width?: number;
  setMode: React.Dispatch<React.SetStateAction<"main" | "trim" | "zoom">>;
  setActiveZoomIdx: React.Dispatch<React.SetStateAction<number>>;
}

const Linepage = ({
  minValue = 0,
  maxValue = 5,
  zoomLevel = 1,
  width = 800,
  setMode,
  setActiveZoomIdx,
}: TimelineProps) => {
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);

    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const generateTicks = () => {
    const ticks: { value: number; type: string; label?: string }[] = [];

    const totalRange = maxValue - minValue;
    const targetTickCount = 8 * zoomLevel; // Increase with zoom
    const roughStep = totalRange / targetTickCount;

    // Round major step to nearest integer second >= 1
    const majorStep = Math.max(1, Math.round(roughStep));

    // Always keep an odd number of subdivisions
    let divisions = 5; // default = 5 ticks (1 major + 4 minors)
    if (zoomLevel > 3) {
      divisions = 7;
    }
    if (zoomLevel > 6) {
      divisions = 9;
    }
    if (zoomLevel > 10) {
      divisions = 11;
    }

    const minorStep = majorStep / (divisions - 1);
    const midIndex = Math.floor(divisions / 2); // middle tick index

    // Start from nearest major tick
    const startMajorTick = Math.ceil(minValue / majorStep) * majorStep;

    for (let v = startMajorTick; v <= maxValue; v += majorStep) {
      ticks.push({ value: v, type: "major", label: formatTime(v) });

      // Add subdivisions
      for (let i = 1; i < divisions; i++) {
        const tickVal = v + i * minorStep;
        if (tickVal < v + majorStep && tickVal < maxValue) {
          ticks.push({
            value: tickVal,
            type: i === midIndex ? "middle" : "minor",
          });
        }
      }
    }
    //console.log("ticks", ticks);
    return ticks;
  };

  const ticks = generateTicks();

  return (
    <div
      className="relative bg-white h-full select-none"
      style={{ width }}
      onClick={() => {
        setMode("main");
        setActiveZoomIdx(-1);
      }}
    >
      {ticks.map((tick, index) => {
        const padding = 20; // space on left & right
        const paddedWidth = width - padding * 2;
        const positionPx =
          padding + ((tick.value - minValue) / (maxValue - minValue)) * paddedWidth;

        return (
          <div
            key={`${tick.type}-${index}`}
            className="absolute flex flex-col items-center"
            style={{
              left: `${positionPx}px`,
              transform: "translateX(-50%)",
            }}
          >
            <div
              className={`bg-[#A594F9] mx-auto ${
                tick.type === "major"
                  ? "w-0.5 h-6"
                  : tick.type === "middle"
                    ? "w-0.5 h-5"
                    : "w-px h-3"
              }`}
            />
            {tick.type === "major" && (
              <span className="text-xs text-[#A594F9] font-medium mt-1 whitespace-nowrap">
                {tick.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Linepage;
