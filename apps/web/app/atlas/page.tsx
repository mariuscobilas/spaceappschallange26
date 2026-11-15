import { redirect } from "next/navigation";
import { parseResearchView, researchViewHref } from "@/lib/map/research-view";

export const metadata = { title: "Regional Atlas | Field Shift" };

type AtlasSearchParams = Record<string, string | string[] | undefined>;

export default async function AtlasPage({
  searchParams,
}: {
  searchParams: Promise<AtlasSearchParams>;
}) {
  const incoming = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
  }

  const parsed = parseResearchView(params);
  redirect(researchViewHref({ ...parsed, view: "research" }));
}
