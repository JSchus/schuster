import type { Metadata, Viewport } from "next";
import { ViewTransitions } from "next-view-transitions";
import { SwRegister } from "@/components/sw-register";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Schuster Media", template: "%s · Schuster Media" },
  description: "Books, video, music, games and files for the Schuster family and friends.",
  applicationName: "Schuster Media",
  appleWebApp: { capable: true, title: "Schuster", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfc" },
    { media: "(prefers-color-scheme: dark)", color: "#18181b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransitions>
      <html lang="en" suppressHydrationWarning>
        <body className="min-h-dvh">
          <ThemeProvider>
            {children}
            <Toaster richColors position="bottom-center" />
          </ThemeProvider>
          <SwRegister />
        </body>
      </html>
    </ViewTransitions>
  );
}
