import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  buildH3Collection,
  hexAt,
  resolutionForZoom,
  resolveObservationDate,
  tileTemplate,
  h3CellFeature,
} from "../lib/map/engine";

test("detailed H3 cells use closed longitude/latitude GeoJSON around the chosen U.S. point", () => {
  const feature = h3CellFeature(hexAt(39, -99, 5), 5);
  const ring = feature.geometry.coordinates[0];
  expect(ring[0]).toEqual(ring.at(-1));
  expect(ring.every(([longitude, latitude]) => longitude > -100 && longitude < -98 && latitude > 38 && latitude < 40)).toBe(true);
});

test("H3 geometry covers geographic CONUS at progressive resolutions", async () => {
  const boundary = JSON.parse(
    await readFile("public/data/conus.geojson", "utf8"),
  );
  const grid = await buildH3Collection(boundary);
  const overview = await buildH3Collection(boundary, 3);
  const continental = await buildH3Collection(boundary, 2);
  expect(continental.features.length).toBeLessThan(overview.features.length);
  expect(grid.features.length).toBeGreaterThan(1000);
  expect(overview.features.length).toBeLessThan(grid.features.length);
  expect(overview.features.length).toBeGreaterThan(100);
  expect(
    grid.features.every((feature) => feature.properties?.resolution === 4),
  ).toBe(true);
  expect(
    overview.features.every((feature) => feature.properties?.resolution === 3),
  ).toBe(true);
  for (const feature of grid.features) {
    const coordinates = feature.geometry.coordinates.flat(3) as number[];
    expect(coordinates.every(Number.isFinite)).toBe(true);
  }
  const tribune = hexAt(38.4697, -101.7521);
  expect(
    grid.features.some((feature) => feature.properties?.hexId === tribune),
  ).toBe(true);
  const polygon = grid.features.find(
    (feature) => feature.properties?.hexId === tribune,
  )!;
  const text = JSON.stringify(polygon.geometry.coordinates);
  expect(text).toContain("-101.");
  expect(tileTemplate("layer", "2026-11-10", "matrix")).toContain(
    "/matrix/{z}/{y}/{x}.png",
  );
});

test("zoom selects the four prescribed H3 resolutions", () => {
  expect([3.99, 4, 5.99, 6, 8.99, 9].map(resolutionForZoom)).toEqual([
    2, 3, 3, 4, 4, 5,
  ]);
});

test("historical date resolver handles dates, ranges, and coverage boundaries", () => {
  expect(
    resolveObservationDate(
      ["2026-01-01/2026-01-10/P3D", "2026-01-14"],
      "2026-01-08",
    ),
  ).toBe("2026-01-07");
  expect(
    resolveObservationDate(["2026-01-01/2026-01-10/P3D"], "2025-12-31"),
  ).toBeNull();
  expect(
    resolveObservationDate(["2026-01-01", "2026-01-05"], "2026-01-03"),
  ).toBe("2026-01-01");
});
