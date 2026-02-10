import type { Metadata } from "next";
import "./globals.css";
import { AdminToggleListener } from "@/components/AdminToggle";

export const metadata: Metadata = {
  title: "FlexiWork Rosta",
  description: "Workforce scheduling made simple",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="min-h-screen antialiased"
        style={{
          background: "linear-gradient(to bottom right, #7c3aed, #4f46e5 55%, #3b82f6)",
        }}
      >
        {children}
        <AdminToggleListener />
      </body>
    </html>
  );
}
