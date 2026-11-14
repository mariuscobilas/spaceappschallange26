import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { MeridianProvider } from "@/components/workspace/MeridianProvider";
import { AppShell } from "@/components/workspace/AppShell";

export const metadata: Metadata = {
  title: { default: "Meridian — Explore", template: "%s — Meridian" },
  description:
    "Explore NASA observations and plan cover-crop decisions for your area.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <MeridianProvider>
          <AppShell>{children}</AppShell>
        </MeridianProvider>
      </body>
    </html>
  );
}
