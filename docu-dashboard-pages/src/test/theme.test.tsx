import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/lib/theme";
import { ThemeToggle } from "@/components/theme-toggle";

afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.classList.remove("dark"); });
describe("Site appearance", () => {
  it("switches the whole document to dark and remembers the choice", () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("marvedge-theme")).toBe("dark");
  });
  it("restores dark appearance on a new visit", () => {
    localStorage.setItem("marvedge-theme", "dark");
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("marvedge-theme")).toBe("light");
  });
});