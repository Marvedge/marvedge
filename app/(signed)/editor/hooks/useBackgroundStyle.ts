import { useCallback } from "react";

const imageMap: Record<string, string> = {
  bg1: "/icons/bg-mountain-sunset.svg",
  bg2: "/icons/bg-abstract-circles.svg",
  bg3: "/icons/bg-crystalline.svg",
  bg4: "/icons/bg-brushstrokes.svg",
  bg5: "/icons/bg-warm-gradients.svg",
  bg6: "/icons/bg-ethereal.svg",
  bg7: "/icons/bg-fiery.svg",
  bg8: "/icons/bg-ribbons.svg",
};

interface UseBackgroundStyleProps {
  selectedBackground: string | null;
  customBackground: File | null;
}

export function useBackgroundStyle({
  selectedBackground,
  customBackground,
}: UseBackgroundStyleProps) {
  const getBackgroundStyle = useCallback(() => {
    if (!selectedBackground) return {};

    if (selectedBackground === "hidden") {
      return { background: "transparent" };
    }

    if (selectedBackground === "custom" && customBackground) {
      return {
        backgroundImage: `url(${URL.createObjectURL(customBackground)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    }

    if (selectedBackground.startsWith("gradient:")) {
      const gradientId = selectedBackground.replace("gradient:", "");
      const gradientMap: Record<string, string> = {
        sunset:
          "linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%)",
        ocean: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        mint: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
        royal: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        steel: "linear-gradient(135deg, #bdc3c7 0%, #2c3e50 100%)",
        candy: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
      };
      return { background: gradientMap[gradientId] || "" };
    }

    if (selectedBackground.startsWith("color:")) {
      const color = selectedBackground.replace("color:", "");
      return { backgroundColor: color };
    }

    if (imageMap[selectedBackground]) {
      return {
        backgroundImage: `url(${imageMap[selectedBackground]})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    }

    return {};
  }, [selectedBackground, customBackground]);

  return { getBackgroundStyle, imageMap };
}
