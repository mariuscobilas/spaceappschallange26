import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { MeridianChatContext } from "@spaceapps/shared";
import { getCropReferences } from "../lib/meridian/crop-references";
import { compareCropScenarios } from "../lib/meridian/crop-comparison";

const context: MeridianChatContext = {
  latitude: 39, longitude: -99, locationName: "Test field", crop: "corn", observationDate: "2026-11-15",
  planningYear: 2027, areaHa: 10, activePlan: { crop: "corn", budget: { grainPrice: "200", baselineYield: "5", seedCost: "30", terminationCost: "10" } },
};
const csv = (crop: string) => {
  const yieldUnit = crop === "Cotton" ? "pounds per planted acre" : "bushels per planted acre";
  const priceUnit = crop === "Cotton" ? "dollars per pound" : "dollars per bushel at harvest";
  const yieldValue = crop === "Cotton" ? 1000 : 100;
  const priceValue = crop === "Cotton" ? 1.2 : 4;
  return [
  '"Commodity","Category","Item","Units","Size","Region","Country","Year","Value","Survey base year"',
  `"${crop}","Supporting information","Price","${priceUnit}","No specific size","U.S. total","United States",2024,${priceValue},"Base survey of 2021"`,
  `"${crop}","Supporting information","Yield","${yieldUnit}","No specific size","U.S. total","United States",2024,${yieldValue},"Base survey of 2021"`,
  `"${crop}","Operating costs","Total, operating costs","dollars per planted acre","No specific size","U.S. total","United States",2024,40,"Base survey of 2021"`,
  `"${crop}","Allocated overhead","Total, allocated overhead","dollars per planted acre","No specific size","U.S. total","United States",2024,60,"Base survey of 2021"`,
  ].join("\n");
};

test("bundled ERS snapshot contains five national realized crop rows and audited source hashes", async () => {
  const references = await getCropReferences(context, undefined, async () => { throw new Error("offline"); });
  expect(references.status).toBe("stale_fallback");
  expect(references.referenceYear).toBe(2025);
  expect(references.geographicMatch).toBe("national_fallback");
  expect(references.rows.map((row) => row.crop).sort()).toEqual(["corn", "cotton", "sorghum", "soybeans", "wheat"]);
  expect(references.provenance.every((source) => /^[a-f0-9]{64}$/.test(source.sha256))).toBeTruthy();
  expect(references.rows.every((row) => row.sourceRegion === "U.S. total" && row.sourceYear === 2025)).toBeTruthy();
  for (const source of references.provenance) {
    const path = source.snapshotPath;
    expect(path).toBeTruthy();
    expect(createHash("sha256").update(readFileSync(resolve(process.cwd(), "../../", path!))).digest("hex")).toBe(source.sha256);
  }
});

test("live CSV parser converts commodity units and sums ERS operating plus allocated costs", async () => {
  const references = await getCropReferences(context, undefined, async (input) => {
    const url = String(input);
    if (url.includes("geocoding.geo.census.gov")) return Response.json({ result: { geographies: { Counties: [{ GEOID: "01001" }] } } });
    const crop = url.includes("cotton") ? "Cotton" : url.includes("sorghum") ? "Sorghum" : url.includes("soybeans") ? "Soybeans" : url.includes("wheat") ? "Wheat" : "Corn";
    return new Response(csv(crop), { status: 200 });
  });
  expect(references.status).toBe("available");
  const corn = references.rows.find((row) => row.crop === "corn")!;
  expect(corn.yieldTHa).toBeCloseTo(6.272, 2);
  expect(corn.priceUsdT).toBeCloseTo(157.47, 1);
  expect(corn.totalCostUsdHa).toBeCloseTo(247.11, 1);
  const cotton = references.rows.find((row) => row.crop === "cotton")!;
  expect(cotton.yieldTHa).toBeCloseTo(1.12085, 4);
  expect(cotton.priceUsdT).toBeCloseTo(2645.55, 1);
});

test("verified raw ERS files parse to current-year regional rows for the official county region", async () => {
  const raw = (crop: string) => readFileSync(resolve(process.cwd(), `../../data/raw/crop-references-v1/${crop}.csv`), "utf8");
  const references = await getCropReferences(context, undefined, async (input) => {
    const url = String(input);
    if (url.includes("geocoding.geo.census.gov")) return Response.json({ result: { geographies: { Counties: [{ GEOID: "01001" }] } } });
    const crop = url.includes("cotton") ? "cotton" : url.includes("sorghum") ? "sorghum" : url.includes("soybeans") ? "soybeans" : url.includes("wheat") ? "wheat" : "corn";
    return new Response(raw(crop), { status: 200 });
  });
  expect(references.referenceYear).toBe(2025);
  expect(references.geographicMatch).toBe("partial_regional");
  expect(references.rows.filter((row) => row.geographicMatch === "regional").map((row) => row.crop).sort()).toEqual(["corn", "cotton", "soybeans"]);
  expect(references.rows.filter((row) => row.geographicMatch === "national_fallback").map((row) => row.crop).sort()).toEqual(["sorghum", "wheat"]);
});

test("comparison honors only matching saved main-crop economics and never double-counts cover costs", async () => {
  const references = await getCropReferences(context, undefined, async () => { throw new Error("offline"); });
  const result = compareCropScenarios(context, undefined, references);
  const corn = result.rows.find((row) => row.crop === "corn")!;
  expect(corn.yieldTHa).toBe(5);
  expect(corn.priceUsdT).toBe(200);
  expect(corn.totalCostUsdHa).toBe(references.rows.find((row) => row.crop === "corn")!.totalCostUsdHa);
  expect(corn.wholeFieldNetReturnUsd).toBe((5 * 200 - corn.totalCostUsdHa!) * 10);
  expect(result.planningYear).toBe(2027);
  expect(result.assumptions.join(" ")).toContain("not a planning-year forecast");
});

test("current draft economics take precedence and unique compatible alternatives apply only to their crop", async () => {
  const references = await getCropReferences(context, undefined, async () => { throw new Error("offline"); });
  const draftContext: MeridianChatContext = {
    ...context,
    economicsDraft: { grainPrice: "260", baselineYield: "6", seedCost: "90", terminationCost: "20" },
    savedAlternatives: [{ crop: "soybeans", coverCrop: "rye", terminationDays: 25, cashCropPlantingDate: "2027-05-01", areaHa: "10", budget: { grainPrice: "400", baselineYield: "4" } }],
  };
  const result = compareCropScenarios(draftContext, undefined, references);
  const corn = result.rows.find((row) => row.crop === "corn")!;
  const soybeans = result.rows.find((row) => row.crop === "soybeans")!;
  expect(corn.yieldTHa).toBe(6);
  expect(corn.priceUsdT).toBe(260);
  expect(soybeans.yieldTHa).toBe(4);
  expect(soybeans.priceUsdT).toBe(400);
  const cleared = compareCropScenarios({ ...context, budgetState: "draft", economicsDraft: { grainPrice: "", baselineYield: "" } }, undefined, references);
  const clearedCorn = cleared.rows.find((row) => row.crop === "corn")!;
  expect(clearedCorn.yieldTHa).toBe(references.rows.find((row) => row.crop === "corn")!.yieldTHa);
  expect(clearedCorn.priceUsdT).toBe(references.rows.find((row) => row.crop === "corn")!.priceUsdT);
});

test("explicit overrides take precedence and zero is a valid user value", async () => {
  const references = await getCropReferences(context, undefined, async () => { throw new Error("offline"); });
  const result = compareCropScenarios(context, [{ crop: "corn", yieldTHa: 0, priceUsdT: 0, totalCostUsdHa: 0 }], references);
  const corn = result.rows.find((row) => row.crop === "corn")!;
  expect(corn.grossRevenueUsdHa).toBe(0);
  expect(corn.netReturnUsdHa).toBe(0);
});

test("regional estimates use official county crosswalk; unsupported crop region is labeled national", async () => {
  const references = await getCropReferences(context, undefined, async (input) => {
    const url = String(input);
    if (url.includes("geocoding.geo.census.gov")) return Response.json({ result: { geographies: { Counties: [{ GEOID: "01001" }] } } });
    const crop = url.includes("cotton") ? "Cotton" : url.includes("sorghum") ? "Sorghum" : url.includes("soybeans") ? "Soybeans" : url.includes("wheat") ? "Wheat" : "Corn";
    let body = csv(crop);
    if (crop === "Corn") body += `\n"Corn","Supporting information","Price","dollars per bushel at harvest","No specific size","Southern Seaboard","United States",2024,5,"Base survey of 2021"\n"Corn","Supporting information","Yield","bushels per planted acre","No specific size","Southern Seaboard","United States",2024,120,"Base survey of 2021"\n"Corn","Operating costs","Total, operating costs","dollars per planted acre","No specific size","Southern Seaboard","United States",2024,50,"Base survey of 2021"\n"Corn","Allocated overhead","Total, allocated overhead","dollars per planted acre","No specific size","Southern Seaboard","United States",2024,70,"Base survey of 2021"`;
    return new Response(body, { status: 200 });
  });
  expect(references.countyFips).toBe("01001");
  expect(references.geographicRegion).toBe("Southern Seaboard");
  expect(references.geographicMatch).toBe("partial_regional");
  expect(references.rows.find((row) => row.crop === "corn")?.sourceRegion).toBe("Southern Seaboard");
  expect(references.rows.find((row) => row.crop === "wheat")?.sourceRegion).toBe("U.S. total");
  const comparison = compareCropScenarios(context, undefined, references);
  expect(comparison.ranking).toEqual(["corn"]);
});

test("missing cost remains unavailable and is excluded from net-return ranking", async () => {
  const references = await getCropReferences(context, undefined, async (input) => {
    const url = String(input);
    if (url.includes("geocoding.geo.census.gov")) return Response.json({ result: { geographies: { Counties: [] } } });
    const crop = url.includes("cotton") ? "Cotton" : url.includes("sorghum") ? "Sorghum" : url.includes("soybeans") ? "Soybeans" : url.includes("wheat") ? "Wheat" : "Corn";
    const body = csv(crop).replace(/"Total, allocated overhead"[^\n]+\n?/, "");
    return new Response(body, { status: 200 });
  });
  const result = compareCropScenarios(context, undefined, references);
  const corn = result.rows.find((row) => row.crop === "corn")!;
  expect(corn.totalCostUsdHa).toBeNull();
  expect(corn.netReturnUsdHa).toBeNull();
  expect(result.ranking).not.toContain("corn");
});

test("an aborted lookup propagates cancellation instead of presenting stale data", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(getCropReferences(context, controller.signal, async (_input, init) => {
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return new Response("");
  })).rejects.toThrow();
});

test("official references are cached by coordinates within the freshness window", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = String(input);
    if (url.includes("geocoding.geo.census.gov")) return Response.json({ result: { geographies: { Counties: [] } } });
    const crop = url.includes("cotton") ? "Cotton" : url.includes("sorghum") ? "Sorghum" : url.includes("soybeans") ? "Soybeans" : url.includes("wheat") ? "Wheat" : "Corn";
    return new Response(csv(crop), { status: 200 });
  };
  try {
    const uniqueContext = { ...context, latitude: 40.12123, longitude: -100.45321 };
    const first = await getCropReferences(uniqueContext);
    expect(calls).toBe(6);
    const second = await getCropReferences(uniqueContext);
    expect(calls).toBe(6);
    expect(second).toEqual(first);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("hung public lookups time out and return the verified fallback", async () => {
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = ((_: number) => originalTimeout(20)) as typeof AbortSignal.timeout;
  let receivedSignal = false;
  try {
    const references = await getCropReferences({ ...context, latitude: 40.22222, longitude: -100.33333 }, undefined, async (_input, init) => {
      receivedSignal = receivedSignal || init?.signal instanceof AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) reject(new DOMException("aborted", "AbortError"));
        else init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
    });
    expect(receivedSignal).toBeTruthy();
    expect(references.status).toBe("stale_fallback");
  } finally {
    AbortSignal.timeout = originalTimeout;
  }
});
