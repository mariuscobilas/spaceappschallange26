import { Suspense } from "react";
import PlanReviewWorkspace from "@/components/workspace/PlanReviewWorkspace";

export const metadata = { title: "Review plan | Field Shift" };

export default function PlanReviewPage() {
  return <Suspense fallback={<section className="mx-auto max-w-4xl p-6" aria-busy="true">Loading plan review…</section>}><PlanReviewWorkspace /></Suspense>;
}
