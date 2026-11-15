import { test, expect } from "@playwright/test";
import type { AtlasCell } from "@spaceapps/shared";
import { latLngToCell } from "h3-js";
import { validateAtlas, atlasCellState } from "../lib/atlas/data";
export const cell = (patch: Partial<AtlasCell> = {}): AtlasCell => ({ h3Index: latLngToCell(39,-99,3),crop:"wheat",scenarioId:"early",activeAreaHa:120,netReturnUsdHa:-30,yieldPenaltyPct:5,rootZoneWetness:.42,soilTexture:"Silt loam",...patch });
export const dataset = () => ({status:"available",message:"Test-only verified-contract dataset; not scientific evidence.",datasetId:"test-only",generatedAt:"2026-11-14T10:00:00Z",validation:{status:"validated",method:"Test fixture",reference:"Fixture only"},scenarios:[{id:"early",label:"Early termination",baseline:"No cover crop",periodStart:"2025-01-01",periodEnd:"2025-12-31"},{id:"late",label:"Late termination",baseline:"No cover crop",periodStart:"2025-01-01",periodEnd:"2025-12-31"}],cells:[cell(),cell({scenarioId:"late",netReturnUsdHa:35})],provenance:[{title:"Test fixture",url:"https://example.org/test-only",spatialMeaning:"H3 aggregate test contract"}]});

test("Atlas validates provenance, nonoverlapping crop/scenario coverage and missing area semantics", () => {
  expect(validateAtlas(dataset())).toBe(true);
  const duplicate=dataset();duplicate.cells.push(cell());expect(validateAtlas(duplicate)).toBe(false);
  expect(validateAtlas({...dataset(),validation:{status:"illustrative"}})).toBe(false);
  expect(validateAtlas({...dataset(),cells:[cell({activeAreaHa:0})]})).toBe(false);
  expect(validateAtlas({...dataset(),cells:[cell({h3Index:"not-h3"})]})).toBe(false);
  expect(atlasCellState(cell({activeAreaHa:0,netReturnUsdHa:null,yieldPenaltyPct:null}))).toBe("no-active-acreage");
  expect(atlasCellState(cell({activeAreaHa:null,netReturnUsdHa:null,yieldPenaltyPct:null}))).toBe("missing");
});
