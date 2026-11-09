import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);
const storageKey = "marvedge-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let preference: string | null = null;
    try { preference = localStorage.getItem(storageKey); } catch { /* Storage may be unavailable. */ }
    const apply = (next: Theme) => {
      document.documentElement.classList.toggle("dark", next === "dark");
      document.documentElement.style.colorScheme = next;
      setTheme(next);
    };
    apply(preference === "light" || preference === "dark" ? preference : media.matches ? "dark" : "light");
    const onSystemChange = () => { if (preference !== "light" && preference !== "dark") apply(media.matches ? "dark" : "light"); };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      preference = event.newValue;
      apply(preference === "light" || preference === "dark" ? preference : media.matches ? "dark" : "light");
    };
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    const onPreference = () => { preference = document.documentElement.classList.contains("dark") ? "dark" : "light"; };
    window.addEventListener("marvedge-theme-change", onPreference);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("marvedge-theme-change", onPreference);
    };
  }, []);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
    try { localStorage.setItem(storageKey, next); } catch { /* Keep the current session usable. */ }
    window.dispatchEvent(new Event("marvedge-theme-change"));
    setTheme(next);
  }
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("Theme provider missing");
  return context;
}