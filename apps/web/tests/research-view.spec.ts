import { expect, test } from "@playwright/test";
import { parseResearchView, researchViewHref } from "@/lib/map/research-view";

test("research view parser defaults to Conditions with pooled corn values", () => {
  expect(parseResearchView(new URLSearchParams())).toEqual({
    view: "conditions",
    crop: "corn",
    period: "2019-2020",
    county: undefined,
  });
});

test("parser accepts supported research filters and a five digit county id", () => {
  expect(parseResearchView(new URLSearchParams("view=research&crop=soybeans&period=2020&county=19153"))).toEqual({
    view: "research",
    crop: "soybeans",
    period: "2020",
    county: "19153",
  });
});

test("unsupported query values fall back without fabricating a county id", () => {
  expect(parseResearchView(new URLSearchParams("view=atlas&crop=wheat&period=2022&county=1915x"))).toEqual({
    view: "conditions",
    crop: "corn",
    period: "2019-2020",
    county: undefined,
  });
});

test("research href uses stable parameter order and includes only formatted counties", () => {
  expect(researchViewHref({ view: "research", crop: "soybeans", period: "2019", county: "19153" }))
    .toBe("/?view=research&crop=soybeans&period=2019&county=19153");
  expect(researchViewHref({ view: "research", crop: "corn", period: "2019-2020", county: "19-153" }))
    .toBe("/?view=research&crop=corn&period=2019-2020");
});

test("conditions view always resolves to the canonical root URL", () => {
  expect(researchViewHref({ view: "conditions", crop: "soybeans", period: "2020", county: "19153" })).toBe("/");
});
