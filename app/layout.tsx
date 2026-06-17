import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "DASHMARKET",
  description:
    "Dashboard de vendas, estoque, publicidade, promocoes e margem de contribuicao por SKU.",
  applicationName: "DASHMARKET",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DASHMARKET"
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#05080a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700;800&family=Fira+Code:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        {/* Anti-flash: lê preferência salva antes do hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const saved = window.localStorage.getItem("dashmarket-theme");
                  document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
                } catch {
                  document.documentElement.dataset.theme = "dark";
                }
              })();
            `
          }}
        />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
