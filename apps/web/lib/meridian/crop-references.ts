import { createHash } from "node:crypto";
import snapshot from "../../../../shared/data/crop-references.json";
import regionCrosswalk from "../../../../shared/data/ers-resource-regions.json";
import type { MeridianChatContext, MeridianCropReferenceRow, MeridianCropReferencesResult } from "@spaceapps/shared";

export type CropReference = MeridianCropReferenceRow;
export type CropReferences = MeridianCropReferencesResult;

const sources = [
  { crop: "corn", url: "https://www.ers.usda.gov/media/4962/corn.csv?v=13755", poundsPerBushel: 56 },
  { crop: "cotton", url: "https://www.ers.usda.gov/media/4964/cotton.csv?v=97889", poundsPerBushel: null },
  { crop: "sorghum", url: "https://www.ers.usda.gov/media/4972/sorghum.csv?v=67371", poundsPerBushel: 56 },
  { crop: "soybeans", url: "https://www.ers.usda.gov/media/4976/soybeans.csv?v=42084", poundsPerBushel: 60 },
  { crop: "wheat", url: "https://www.ers.usda.gov/media/4978/wheat.csv?v=86392", poundsPerBushel: 60 },
] as const;
const hectaresPerAcre = 0.40468564224;
const poundsToTonnes = 0.00045359237;
const cache = new Map<string, { storedAt: number; value: CropReferences }>();
const cacheTtlMs = 6 * 60 * 60 * 1000;
const sourceTimeoutMs = 10_000;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ",") { row.push(cell); cell = ""; }
    else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); if (row.some((part) => part.trim())) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error("ERS CSV exceeds the 3 MB source limit");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0, result = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("ERS CSV exceeds the 3 MB source limit"); }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally { reader.releaseLock(); }
}

function deriveReference(crop: typeof sources[number], text: string, requestedYear?: number, targetRegion?: string | null): { year: number; row: CropReference; availableYears: number[] } {
  const [header = [], ...body] = parseCsv(text.replace(/^\uFEFF/, ""));
  const col = (name: string) => header.findIndex((value) => value.trim() === name);
  const yearIdx = col("Year"), regionIdx = col("Region"), itemIdx = col("Item"), valueIdx = col("Value"), unitIdx = col("Units");
  if ([yearIdx, regionIdx, itemIdx, valueIdx, unitIdx].some((idx) => idx < 0)) throw new Error("Unexpected ERS CSV headers");
  const lastCompletedYear = new Date().getUTCFullYear() - 1;
  const completeYears = (region: string) => {
    const items = new Map<number, Set<string>>();
    for (const row of body) {
      const year = Number(row[yearIdx]), raw = row[valueIdx]?.trim();
      if (row[regionIdx]?.trim() !== region || !Number.isInteger(year) || year > lastCompletedYear || !raw || !Number.isFinite(Number(raw))) continue;
      const keys = items.get(year) ?? new Set<string>(); keys.add(row[itemIdx]?.trim()); items.set(year, keys);
    }
    return [...items.entries()].filter(([, keys]) => keys.has("Yield") && keys.has("Price")).map(([year]) => year);
  };
  // All crop references share the latest completed U.S. source year. At that year,
  // use a regional value only where that crop publishes a complete regional record.
  const availableYears = completeYears("U.S. total");
  const latest = requestedYear ?? Math.max(...availableYears);
  if (!availableYears.includes(latest)) throw new Error(`ERS CSV has no common-year observation for ${crop.crop} ${latest}`);
  const valuesByRegion = new Map<string, Map<string, number>>();
  const unitsByRegion = new Map<string, Map<string, string>>();
  for (const row of body) {
    if (Number(row[yearIdx]) !== latest) continue;
    const region = row[regionIdx]?.trim(), raw = row[valueIdx]?.trim(), n = Number(raw);
    if (raw && Number.isFinite(n)) {
      const item = row[itemIdx]?.trim();
      if (["Yield", "Price", "Total, operating costs", "Total, allocated overhead"].includes(item) && n < 0) throw new Error(`Negative ERS ${item} for ${crop.crop} ${latest}`);
      const values = valuesByRegion.get(region) ?? new Map<string, number>();
      if (values.has(item) && values.get(item) !== n) throw new Error(`Conflicting duplicate ERS ${item} rows for ${crop.crop} ${latest}`);
      const units = unitsByRegion.get(region) ?? new Map<string, string>();
      if (units.has(item) && units.get(item) !== row[unitIdx]?.trim()) throw new Error(`Conflicting duplicate ERS units for ${crop.crop} ${latest}`);
      values.set(item, n); valuesByRegion.set(region, values);
      units.set(item, row[unitIdx]?.trim()); unitsByRegion.set(region, units);
    }
  }
  const complete = (values?: Map<string, number>) => values && values.has("Yield") && values.has("Price");
  const region = targetRegion && complete(valuesByRegion.get(targetRegion)) ? targetRegion : "U.S. total";
  const values = valuesByRegion.get(region);
  if (!complete(values)) throw new Error(`ERS data incomplete for ${crop.crop} ${latest}`);
  const yieldValue = values!.get("Yield"), priceValue = values!.get("Price");
  const operating = values!.get("Total, operating costs"), overhead = values!.get("Total, allocated overhead");
  const units = unitsByRegion.get(region)!;
  const expectedYield = crop.poundsPerBushel ? "bushels per planted acre" : "pounds per planted acre";
  const validPriceUnit = crop.poundsPerBushel ? units.get("Price")?.startsWith("dollars per bushel") : units.get("Price") === "dollars per pound";
  if (units.get("Yield") !== expectedYield || !validPriceUnit || (operating !== undefined && units.get("Total, operating costs") !== "dollars per planted acre") || (overhead !== undefined && units.get("Total, allocated overhead") !== "dollars per planted acre")) throw new Error(`Unexpected ERS units for ${crop.crop} ${latest}`);
  const yieldTHa = crop.poundsPerBushel
    ? yieldValue! * crop.poundsPerBushel * poundsToTonnes / hectaresPerAcre
    : yieldValue! * poundsToTonnes / hectaresPerAcre;
  const priceUsdT = crop.poundsPerBushel
    ? priceValue! / (crop.poundsPerBushel * poundsToTonnes)
    : priceValue! / poundsToTonnes;
  const totalCostUsdHa = operating === undefined || overhead === undefined ? null : (operating + overhead) / hectaresPerAcre;
  return { year: latest, availableYears, row: { crop: crop.crop, yieldTHa, priceUsdT, totalCostUsdHa, sourceRegion: region, sourceYear: latest, geographicMatch: region === "U.S. total" ? "national_fallback" : "regional", units: "tonnes/ha; USD/tonne; USD/ha", sourceUrl: crop.url } };
}

/** Fetches current ERS actuals server-side; bundles the last verified snapshot for offline/outage use. */
export async function getCropReferences(_context: MeridianChatContext, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<CropReferences> {
  const cacheKey = `${_context.latitude},${_context.longitude}`;
  const cached = cache.get(cacheKey);
  if (fetcher === fetch && !signal?.aborted && cached && Date.now() - cached.storedAt < cacheTtlMs) return cached.value;
  const base = snapshot as Omit<CropReferences, "status" | "message">;
  const lookupSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(sourceTimeoutMs)]) : AbortSignal.timeout(sourceTimeoutMs);
  let countyFips: string | null = null, geographicRegion: string | null = null;
  try {
    try {
      const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/coordinates");
      url.search = new URLSearchParams({ x: String(_context.longitude), y: String(_context.latitude), benchmark: "Public_AR_Current", vintage: "Current_Current", format: "json" }).toString();
      const response = await fetcher(url.toString(), { signal: lookupSignal, cache: "no-store" });
      if (response.ok) {
        const result = await response.json() as { result?: { geographies?: { Counties?: Array<{ GEOID?: string }> } } };
        countyFips = result.result?.geographies?.Counties?.[0]?.GEOID?.slice(0, 5) ?? null;
        geographicRegion = countyFips ? (regionCrosswalk.counties as Record<string, string>)[countyFips] ?? null : null;
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      console.error("County-to-region lookup failed; using national fallback", { error: error instanceof Error ? error.name : "UnknownError" });
    }
    if (signal?.aborted) throw signal.reason ?? new Error("Aborted");
    const fetched = await Promise.all(sources.map(async (source) => {
      const response = await fetcher(source.url, { signal: lookupSignal, cache: "no-store" });
      if (!response.ok) throw new Error(`ERS returned HTTP ${response.status}`);
      const text = await readTextLimited(response, 3_000_000);
      const derived = deriveReference(source, text, undefined, geographicRegion);
      return { text, availableYears: derived.availableYears, sha256: createHash("sha256").update(text).digest("hex"), rawBytes: new TextEncoder().encode(text).length, sourceUrl: source.url };
    }));
    const commonYears = fetched.map((item) => new Set(item.availableYears)).reduce((common, years) => new Set([...common].filter((year) => years.has(year))));
    const referenceYear = Math.max(...commonYears);
    if (!Number.isFinite(referenceYear)) throw new Error("ERS files do not share a common U.S. actual year");
    const derived = fetched.map((item, index) => deriveReference(sources[index], item.text, referenceYear, geographicRegion));
    const rows = derived.map((item) => item.row);
    const regionalCount = rows.filter((row) => row.sourceRegion !== "U.S. total").length;
    const geographicMatch: CropReferences["geographicMatch"] = regionalCount === rows.length ? "regional" : regionalCount ? "partial_regional" : "national_fallback";
    const message = geographicMatch === "regional"
      ? `ERS farm resource region: ${geographicRegion}; estimates are available for all listed crops.`
      : geographicMatch === "partial_regional"
        ? `ERS farm resource region: ${geographicRegion}; only region-matched crops are locally ranked. Other rows are U.S. national references.`
        : "Using national U.S. values; no county-level ERS crop reference match was available.";
    const assumptions = [
      geographicMatch === "national_fallback" ? "National U.S. crop estimates; no matched regional crop value is asserted." : `ERS resource region: ${geographicRegion}; source records are matched to that region where published.`,
      "ERS values are realized estimates from one latest common completed source year, not planning-year forecasts or field-level estimates.",
      "Regional estimates are not available for every crop; national fallback rows are displayed separately and excluded from regional rankings.",
      "ERS estimates are not adjusted for irrigation status or field-specific management.",
      "Price and yield represent the primary commodity; secondary-product revenue is excluded from revenue calculations.",
      "Total main-crop cost is operating costs plus allocated overhead. Cover seed, termination, and subsidy economics are separate.",
    ];
    const crosswalkSource = base.provenance.find((item) => item.crop === "all");
    const result = { ...base, referenceYear, rows, geographicMatch, geographicRegion, countyFips, assumptions, provenance: [...fetched.map((item, index) => ({ crop: sources[index].crop, sourceUrl: item.sourceUrl, retrievedAt: new Date().toISOString(), sha256: item.sha256, rawBytes: item.rawBytes })), ...(countyFips && crosswalkSource ? [crosswalkSource] : [])], status: "available" as const, message };
    if (fetcher === fetch) {
      cache.set(cacheKey, { storedAt: Date.now(), value: result });
      if (cache.size > 32) cache.delete(cache.keys().next().value!);
    }
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    const detail = error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[source]").slice(0, 120) : "UnknownError";
    console.error("USDA ERS references unavailable; using verified snapshot", { error: error instanceof Error ? error.name : "UnknownError", detail });
    return { ...base, countyFips, status: "stale_fallback", message: `USDA ERS could not be reached; showing the bundled ${base.referenceYear} U.S. national snapshot.` };
  }
}
