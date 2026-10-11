import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StayZero — Find a way to stay for ₹0",
  description: "Explore documented free, donation, and exchange stays with clear costs, requirements, and source links.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
