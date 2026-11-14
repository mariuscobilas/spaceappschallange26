import type { Metadata } from "next";
import IntelWorkspace from "@/components/workspace/IntelWorkspace";
export const metadata: Metadata = { title: "Ask Meridian" };
export default function IntelPage() {
  return <IntelWorkspace />;
}
