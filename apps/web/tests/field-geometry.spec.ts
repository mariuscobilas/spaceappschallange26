import { expect, test } from "@playwright/test";
import type { GeoPolygon } from "@spaceapps/shared";
import { analyzeBoundary } from "../lib/fields/geometry";

const rectangle: GeoPolygon = {
  type: "Polygon",
  coordinates: [[
    [-100, 40],
    [-99.97, 40],
    [-99.97, 40.03],
    [-100, 40.03],
    [-100, 40],
  ]],
};

test("computes geodesic hectares and interior representative points", () => {
  const result = analyzeBoundary(rectangle);
  expect(result).not.toBeNull();
  expect(result!.areaHectares).toBeGreaterThan(700);
  expect(result!.areaHectares).toBeLessThan(1_000);
  expect(result!.centroid.latitude).toBeCloseTo(40.015, 2);
  expect(result!.sample.longitude).toBeGreaterThanOrEqual(-100);
  expect(result!.sample.longitude).toBeLessThanOrEqual(-99.97);
  expect(result!.error).toBeUndefined();
});

test("finds an interior sample for a concave field", () => {
  const concave: GeoPolygon = {
    type: "Polygon",
    coordinates: [[
      [-100, 40], [-99.96, 40], [-99.96, 40.04], [-99.99, 40.04],
      [-99.99, 40.01], [-100, 40.01], [-100, 40],
    ]],
  };
  const result = analyzeBoundary(concave);
  expect(result).not.toBeNull();
  expect(result!.sample.latitude).toBeGreaterThanOrEqual(40);
  expect(result!.sample.latitude).toBeLessThanOrEqual(40.04);
  expect(result!.sample.longitude).toBeGreaterThanOrEqual(-100);
  expect(result!.sample.longitude).toBeLessThanOrEqual(-99.96);
  expect(result!.error).toBeUndefined();
});

test("reports self-intersections while rejecting malformed rings", () => {
  const crossing: GeoPolygon = {
    type: "Polygon",
    coordinates: [[[-100, 40], [-99.8, 40.2], [-100, 40.2], [-99.8, 40], [-100, 40]]],
  };
  expect(analyzeBoundary(crossing)?.error).toMatch(/cross/);
  expect(analyzeBoundary({ type: "Polygon", coordinates: [] })).toBeNull();
  expect(analyzeBoundary({
    type: "Polygon",
    coordinates: [[[-100, 40], [-99.8, 40], [-99.8, 40.2]]],
  })).toBeNull();
});

test("keeps area available but reports oversized fields", () => {
  const oversized: GeoPolygon = {
    type: "Polygon",
    coordinates: [[[-100, 40], [-99.5, 40], [-99.5, 40.5], [-100, 40.5], [-100, 40]]],
  };
  const result = analyzeBoundary(oversized);
  expect(result?.areaHectares).toBeGreaterThan(5_000);
  expect(result?.error).toMatch(/5,000 hectare/);
});
