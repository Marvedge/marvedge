import MarvedgeBrandkit from "../components/brandkit/MarvedgeBrandkit";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marvedge Brand Kit & Design System",
  description: "Official design guidelines, palette tokens, typography rules, and UI components for Marvedge.",
};

export default function BrandkitPage() {
  return <MarvedgeBrandkit />;
}
