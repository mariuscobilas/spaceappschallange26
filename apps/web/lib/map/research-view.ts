export type ResearchView = {
  view: "conditions" | "research";
  crop: "corn" | "soybeans";
  period: "2019-2020" | "2019" | "2020";
  county?: string;
};

const defaultResearchView: ResearchView = {
  view: "conditions",
  crop: "corn",
  period: "2019-2020",
};

export function parseResearchView(params: URLSearchParams): ResearchView {
  const view = params.get("view");
  const crop = params.get("crop");
  const period = params.get("period");
  const county = params.get("county");

  return {
    view: view === "research" ? "research" : view === "conditions" ? "conditions" : defaultResearchView.view,
    crop: crop === "soybeans" ? "soybeans" : crop === "corn" ? "corn" : defaultResearchView.crop,
    period: period === "2019" || period === "2020" || period === "2019-2020"
      ? period
      : defaultResearchView.period,
    county: county && /^\d{5}$/.test(county) ? county : undefined,
  };
}

export function researchViewHref(state: ResearchView): string {
  if (state.view === "conditions") return "/";

  const params = new URLSearchParams();
  params.set("view", "research");
  params.set("crop", state.crop);
  params.set("period", state.period);
  if (state.county && /^\d{5}$/.test(state.county)) params.set("county", state.county);
  return `/?${params.toString()}`;
}
