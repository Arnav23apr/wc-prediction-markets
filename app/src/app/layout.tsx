import type { Metadata } from "next";
import "./globals.css";
import { AppWalletProvider } from "@/components/AppWalletProvider";
import { ToastProvider } from "@/components/Toast";
import { SmoothScroll } from "@/components/SmoothScroll";
import { CursorGlow } from "@/components/CursorGlow";
import { BootIntro } from "@/components/BootIntro";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";
const DESCRIPTION = "Bet the World Cup in parimutuel pools on Solana. Results verified on-chain against TxLINE Merkle roots. No oracle, no vote, no bookie.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Markets — bet the World Cup, settled by proof", template: "%s · Markets" },
  description: DESCRIPTION,
  openGraph: {
    title: "Markets — bet the World Cup, settled by proof",
    description: DESCRIPTION,
    url: "/",
    siteName: "World Cup Markets",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Markets — bet the World Cup, settled by proof" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Markets — bet the World Cup, settled by proof",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;500;600;700&family=Orbitron:wght@500;600;700;800&family=Barlow+Condensed:wght@500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <BootIntro />
        <SmoothScroll />
        <CursorGlow />
        <AppWalletProvider>
          <ToastProvider>{children}</ToastProvider>
        </AppWalletProvider>
      </body>
    </html>
  );
}
