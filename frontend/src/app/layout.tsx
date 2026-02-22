import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import "./_styles/webserver.css";

export const metadata: Metadata = {
  title: "To-Do",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = (await cookies()).get("theme")?.value === "light" ? "theme-light" : "theme-dark";
  return (
    <html lang="en">
      <body className={theme}>{children}</body>
    </html>
  );
}
