import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { regionalYieldCollection } from "../lib/map/regional-yield-renderer";
import { validateRegionalYield } from "../lib/atlas/regional-yield";
import type { RegionalYieldDataset } from "@spaceapps/shared";

const dataset=JSON.parse(readFileSync("public/data/regional-yield.json","utf8")) as RegionalYieldDataset;

test("validates the published county fixture against provenance and geometry constraints",()=>{
 expect(validateRegionalYield(dataset)).toBe(true);
 const badUrl=structuredClone(dataset);(badUrl.source as any).url="javascript:alert(1)";expect(validateRegionalYield(badUrl)).toBe(false);
 const duplicateCounty=structuredClone(dataset);duplicateCounty.regions.push(structuredClone(duplicateCounty.regions[0]));expect(validateRegionalYield(duplicateCounty)).toBe(false);
 const duplicateEstimate=structuredClone(dataset);duplicateEstimate.regions[0].estimates.push(structuredClone(duplicateEstimate.regions[0].estimates[0]));expect(validateRegionalYield(duplicateEstimate)).toBe(false);
 const badYears=structuredClone(dataset);badYears.regions[0].estimates[0].sampleRecordsByYear["2019"]+=1;expect(validateRegionalYield(badYears)).toBe(false);
 const outside=structuredClone(dataset);outside.regions[0].geometry.coordinates[0][0][0]=0;expect(validateRegionalYield(outside)).toBe(false);
 const numberFips=structuredClone(dataset);(numberFips.regions[0] as any).fips=17001;expect(validateRegionalYield(numberFips)).toBe(false);
 const badSha=structuredClone(dataset);(badSha.source as any).archiveSha256="abc";expect(validateRegionalYield(badSha)).toBe(false);
});

test("keeps missing county estimates null and marks selected geometry",()=>{
 const result=regionalYieldCollection(dataset,"corn","2019-2020","17001");
 const selected=result.features.find(f=>f.id==="17001")!;
 expect(selected.properties).toMatchObject({fips:"17001",selected:true});
 const missing=result.features.find(f=>f.properties?.effect===null);
 expect(missing?.properties).toMatchObject({effect:null,sampleRecords:null});
 expect(selected.geometry.type).toMatch(/Polygon/);
});
