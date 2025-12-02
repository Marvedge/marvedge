import "./globals.css";
import { SonnerToaster } from "./components/sonner-toaster";
import { Providers } from "./providers";
import { Raleway } from "next/font/google";

const raleway = Raleway({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-raleway",
});

export const metadata = {
  title: "Marvedge",
  description: "Turn Clicks Into Customers with Interactive Demos",
  icons: {
    icon: "/icons/Transparent logo.png",
  },
};

export const viewport = "width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`overflow-x-hidden ${raleway.variable}`}>
      <body className="overflow-x-hidden bg-white">
        <Providers>
          {children}
          <SonnerToaster />
        </Providers>
      </body>
    </html>
  );
}
