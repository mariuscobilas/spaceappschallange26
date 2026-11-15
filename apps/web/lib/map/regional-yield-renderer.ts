import type { Feature, FeatureCollection } from "geojson";
import type { RegionalYieldDataset, RegionalYieldCrop, RegionalYieldPeriod, RegionalYieldRegion } from "@spaceapps/shared";

export function regionalYieldEstimate(region: RegionalYieldRegion, crop: RegionalYieldCrop, period: RegionalYieldPeriod) {
  return region.estimates.find(e => e.crop === crop && e.period === period);
}
export function regionalYieldCollection(data: RegionalYieldDataset, crop: RegionalYieldCrop, period: RegionalYieldPeriod, selectedFips?: string): FeatureCollection {
  const features: Feature[] = data.regions.map(region => {
    const estimate = regionalYieldEstimate(region,crop,period);
    return {type:"Feature", id:region.fips, geometry:region.geometry as Feature["geometry"], properties:{fips:region.fips,name:region.name,state:region.state, centroid:region.centroid, sampleRecords:estimate?.sampleRecords ?? null, sampleRecords2019:estimate?.sampleRecordsByYear["2019"] ?? null,sampleRecords2020:estimate?.sampleRecordsByYear["2020"] ?? null,effect:estimate?.meanYieldEffectPct ?? null, selected:region.fips===selectedFips}};
  });
  return {type:"FeatureCollection",features};
}
export function regionalYieldBounds(data: RegionalYieldDataset): [[number,number],[number,number]] | null {
  let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
  const visit=(v:unknown)=>{if(!Array.isArray(v))return;if(v.length===2&&typeof v[0]==="number"&&typeof v[1]==="number"){west=Math.min(west,v[0]);east=Math.max(east,v[0]);south=Math.min(south,v[1]);north=Math.max(north,v[1]);return;} for(const child of v)visit(child);};
  for(const region of data.regions)visit(region.geometry.coordinates);
  return Number.isFinite(west)?[[west,south],[east,north]]:null;
}
export function yieldColorExpression(): unknown[] {
  return ["case",["==",["get","effect"],null],"#a8aaa4",["interpolate",["linear"],["get","effect"],-10,"#b91c1c",0,"#f4f0dc",10,"#16804a"]];
}
