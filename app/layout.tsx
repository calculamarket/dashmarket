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
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const savedTheme = window.localStorage.getItem("dashmarket-theme");
                  document.documentElement.dataset.theme = savedTheme === "light" ? "light" : "dark";
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
