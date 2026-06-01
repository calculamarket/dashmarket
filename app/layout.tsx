import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DASHMARKET",
  description:
    "Dashboard de vendas, estoque, publicidade, promocoes e margem de contribuicao por SKU."
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
      </body>
    </html>
  );
}
