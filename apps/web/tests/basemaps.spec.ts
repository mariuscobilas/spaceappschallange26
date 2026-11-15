import { expect, test } from "@playwright/test";
import { BASEMAP_OPTIONS, DEFAULT_BASEMAP, getBasemapStyle, isBasemapId } from "../lib/map/basemaps";
import { initialSettings, validMapSettings } from "../lib/workspace";

test("basemap selection preserves backwards compatibility and validates known providers", () => {
  expect(DEFAULT_BASEMAP).toBe("positron");
  expect(BASEMAP_OPTIONS.map((option) => option.value)).toEqual([
    "positron", "liberty", "dark", "usgs-topo", "usgs-imagery",
  ]);
  expect(isBasemapId("usgs-topo")).toBeTruthy();
  expect(isBasemapId("untrusted-style-url")).toBeFalsy();
  const { basemap: _basemap, ...legacy } = initialSettings;
  expect(validMapSettings(legacy)).toBeTruthy();
  expect(validMapSettings({ ...initialSettings, basemap: "unknown" })).toBeFalsy();
});

test("OpenFreeMap and USGS styles use reviewed sources and visible attribution", () => {
  expect(getBasemapStyle("positron")).toBe("https://tiles.openfreemap.org/styles/positron");
  expect(getBasemapStyle("liberty")).toBe("https://tiles.openfreemap.org/styles/liberty");
  expect(getBasemapStyle("dark")).toBe("https://tiles.openfreemap.org/styles/dark");
  const topo = getBasemapStyle("usgs-topo");
  const imagery = getBasemapStyle("usgs-imagery");
  expect(typeof topo).toBe("object");
  expect(topo).toMatchObject({ sources: { "national-map": { type: "raster", maxzoom: 16, attribution: "USGS The National Map" } } });
  expect(imagery).toMatchObject({ sources: { "national-map": { type: "raster", maxzoom: 23, attribution: expect.stringContaining("not live") } } });
  expect((imagery as { sources: Record<string, { tiles: string[] }> }).sources["national-map"].tiles[0]).toContain("USGSImageryOnly/MapServer/tile/{z}/{y}/{x}");
});
