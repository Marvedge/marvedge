import { useCallback, useEffect, useState } from "react";

const imageMap: Record<string, string> = {
  // Default thumbnails shown when no type is selected
  def_mac_1: "/background-default-images/mac-1.jpg",
  def_mac_2: "/background-default-images/mac-2.jpg",
  def_mac_3: "/background-default-images/mac-3.jpg",
  def_mac_4: "/background-default-images/mac-4.jpg",
  def_windows_1: "/background-default-images/windows-1.jpg",
  def_windows_2: "/background-default-images/windows-2.jpg",
  def_windows_3: "/background-default-images/windows-3.png",
  def_windows_4: "/background-default-images/windows-4.jpg",

  // Solid backgrounds
  solid_blue_1: "/solid/blue-1.png",
  solid_blue_2: "/solid/blue-2.png",
  solid_blue_3: "/solid/blue-3.png",
  solid_blue_4: "/solid/blue-4.png",
  solid_green_1: "/solid/green-1.png",
  solid_green_2: "/solid/green-2.png",
  solid_green_3: "/solid/green-3.png",
  solid_green_4: "/solid/green-4.png",
  solid_orange_1: "/solid/orange-1.png",
  solid_orange_2: "/solid/orange-2.png",
  solid_orange_3: "/solid/orange-3.png",
  solid_orange_4: "/solid/orange-4.png",
  solid_red_1: "/solid/red-1.jpg",
  solid_red_2: "/solid/red-2.jpg",
  solid_red_3: "/solid/red-3.jpg",
  solid_red_4: "/solid/red-4.jpg",
  solid_yellow_1: "/solid/yellow-1.png",
  solid_yellow_2: "/solid/yellow-2.png",
  solid_yellow_3: "/solid/yellow-3.png",
  solid_yellow_4: "/solid/yellow-4.png",

  // Gradient backgrounds (images)
  grad_dark_1: "/gradient/gradient_dark-1.jpg",
  grad_dark_2: "/gradient/gradient_dark-2.jpg",
  grad_dark_3: "/gradient/gradient_dark-3.jpg",
  grad_dark_4: "/gradient/gradient_dark-4.jpg",
  grad_light_1: "/gradient/gradient_light-1.png",
  grad_light_2: "/gradient/gradient_light-2.jpg",
  grad_light_3: "/gradient/gradient_light-3.png",
  grad_light_4: "/gradient/gradient_light-4.jpg",
};

interface UseBackgroundStyleProps {
  selectedBackground: string | null;
  customBackground: File | null;
}

export function useBackgroundStyle({
  selectedBackground,
  customBackground,
}: UseBackgroundStyleProps) {
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (customBackground) {
      const url = URL.createObjectURL(customBackground);
      setCustomBgUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCustomBgUrl(null);
    }
  }, [customBackground]);

  const getBackgroundStyle = useCallback(() => {
    if (!selectedBackground) {
      return {};
    }

    if (selectedBackground === "hidden") {
      return { background: "transparent" };
    }

    if (selectedBackground === "custom" && customBgUrl) {
      return {
        backgroundImage: `url(${customBgUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    }

    if (selectedBackground.startsWith("gradient:")) {
      const gradientId = selectedBackground.replace("gradient:", "");
      const gradientMap: Record<string, string> = {
        sunset: "linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%)",
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
  }, [selectedBackground, customBgUrl]);

  return { getBackgroundStyle, imageMap };
}
