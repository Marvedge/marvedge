import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return <Button type="button" variant="ghost" size="icon" className="theme-toggle" title={label} aria-label={label} onClick={toggleTheme}>{theme === "dark" ? <Sun /> : <Moon />}</Button>;
}