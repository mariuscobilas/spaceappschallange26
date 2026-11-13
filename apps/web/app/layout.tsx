import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Field Shift",
  description: "NASA Space Apps Challenge 2026 project starter",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
