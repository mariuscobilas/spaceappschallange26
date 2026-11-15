import type { Metadata } from "next";
import IntelWorkspace from "@/components/workspace/IntelWorkspace";
export const metadata: Metadata = { title: "Meridian" };
export default function IntelPage() {
  return <IntelWorkspace />;
}
