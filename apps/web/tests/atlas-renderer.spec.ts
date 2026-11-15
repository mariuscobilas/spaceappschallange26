import { expect, test } from "@playwright/test";
import { cellToBoundary } from "h3-js";
import { atlasColor, atlasFeatureCollection, ATLAS_LEGEND_STOPS, ATLAS_NO_ACREAGE_COLOR, ATLAS_NO_DATA_COLOR, validatedAtlasCells } from "../lib/map/atlas-renderer";

const validCell = {
  h3Index: "8928308280fffff",
  crop: "wheat",
  scenarioId: "baseline",
  activeAreaHa: 100,
  netReturnUsdHa: 50,
  yieldPenaltyPct: null,
  rootZoneWetness: null,
  soilTexture: null,
} as const;

test("validates and deduplicates backend cells without synthesizing regional values", () => {
  const result = validatedAtlasCells([
    validCell,
    { ...validCell, netReturnUsdHa: 999 },
    { ...validCell, h3Index: "not-an-index" },
    { ...validCell, activeAreaHa: Number.NaN },
    { ...validCell, crop: "invented" },
  ]);
  expect(result).toEqual([validCell]);
});

test("maps net return to fixed diverging legend colors and distinguishes missing coverage", () => {
  expect(atlasColor(-200)).toBe(ATLAS_LEGEND_STOPS[0].color);
  expect(atlasColor(0)).toBe(ATLAS_LEGEND_STOPS[2].color);
  expect(atlasColor(200)).toBe(ATLAS_LEGEND_STOPS[4].color);
  expect(atlasColor(900)).toBe(ATLAS_LEGEND_STOPS[4].color);
  expect(atlasColor(null, 100)).toBe(ATLAS_NO_DATA_COLOR);
  expect(atlasColor(null, 0)).toBe(ATLAS_NO_ACREAGE_COLOR);
});

test("builds polygon geometry directly from validated H3 cells and preserves null source values", () => {
  const [first] = cellToBoundary(validCell.h3Index, true);
  const collection = atlasFeatureCollection([validCell]);
  expect(collection.features).toHaveLength(1);
  expect(collection.features[0].geometry.type).toBe("Polygon");
  expect(collection.features[0].geometry.coordinates[0][0]).toEqual([first[0], first[1]]);
  expect(collection.features[0].properties?.rootZoneWetness).toBeNull();
  expect(collection.features[0].properties?.soilTexture).toBeNull();
});
