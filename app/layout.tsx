import "./globals.css";
import { SonnerToaster } from "./components/sonner-toaster";
import { Providers } from "./providers";
import Hero from "./components/Hero";
import Hero1 from "./components/Hero1";
import Hero2 from "./components/Hero2";
import Hero3 from "./components/Hero3";
import Hero4 from "./components/Hero4";

export const metadata = {
  title: "Marvedge",
  icons: {
    icon: "/icons/Transparent logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className="overflow-x-hidden">
        <Providers>
          {children}
          <SonnerToaster />
          <Hero />
          <Hero1 />
          <Hero2 />
          <Hero3 />
          <Hero4 />
        </Providers>
      </body>
    </html>
  );
}
