import "./globals.css";
import { SonnerToaster } from "./components/sonner-toaster";
import { Providers } from "./providers";

export const metadata = {
  title: "Marvedge",
  icons: {
    icon: "/icons/Transparent logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className="overflow-x-hidden">
        <Providers>
          {children}
          <SonnerToaster />
        </Providers>
      </body>
    </html>
  );
}
