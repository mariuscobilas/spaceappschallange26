import { test, expect } from "@playwright/test";
import { latLngToCell } from "h3-js";
const hex=latLngToCell(39,-99,3);
const cell={h3Index:hex,crop:"wheat",scenarioId:"early",activeAreaHa:120,netReturnUsdHa:-30,yieldPenaltyPct:5,rootZoneWetness:.42,soilTexture:"Silt loam"};
const dataset={status:"available",message:"Test-only dataset",datasetId:"test-only",generatedAt:"2026-11-14T10:00:00Z",validation:{status:"validated",method:"Test fixture",reference:"Not scientific evidence"},scenarios:[{id:"early",label:"Early termination",baseline:"No cover crop",periodStart:"2025-01-01",periodEnd:"2025-12-31"},{id:"late",label:"Late termination",baseline:"No cover crop",periodStart:"2025-01-01",periodEnd:"2025-12-31"}],cells:[cell,{...cell,scenarioId:"late",activeAreaHa:0,netReturnUsdHa:null,yieldPenaltyPct:null}],provenance:[{title:"Fixture only",url:"https://example.org/test-only",spatialMeaning:"H3 aggregate test"}]};

test("Atlas filters validated records and distinguishes no acreage, no coverage and unavailable services", async ({ page }) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.route("**/api/v1/atlas",route=>route.fulfill({json:dataset}));
  await page.route("**/api/v1/field-conditions?**",route=>route.abort());
  await page.goto("/atlas");
  await page.getByLabel("Atlas layer").selectOption("returns");
  await expect(page.getByRole("region",{name:"Regional dataset controls"})).toContainText("1 covered regions");
  await page.getByText("Net return legend and dataset sources",{exact:true}).click();
  await expect(page.getByLabel("Net return legend")).toContainText("$0 / ha");
  await expect(page.getByText(/Baseline: No cover crop/)).toBeVisible();
  await page.getByLabel("Management scenario").selectOption("late");
  await expect(page.getByRole("region",{name:"Regional dataset controls"})).toContainText("No active acreage");
  await page.getByLabel("Cash crop",{exact:true}).selectOption("corn");
  await expect(page.getByRole("region",{name:"Regional dataset controls"})).toContainText("No coverage");
  await page.route("**/api/v1/atlas",route=>route.fulfill({status:503,json:{status:"unavailable",message:"Validated dataset not configured",datasetId:null,generatedAt:null,validation:null,scenarios:[],cells:[],provenance:[]}}));
  await page.getByRole("button",{name:"Refresh regional data"}).click();
  await expect(page.getByRole("region",{name:"Regional dataset controls"})).toContainText("Validated dataset not configured");
});

test("Atlas withholds unvalidated regional values",async({page})=>{
  await page.route("**/api/v1/atlas",route=>route.fulfill({json:{...dataset,validation:{status:"illustrative"}}}));
  await page.goto("/atlas");
  await page.getByLabel("Atlas layer").selectOption("returns");
  await expect(page.getByRole("region",{name:"Regional dataset controls"})).toContainText("validated regional dataset is not available");
  await expect(page.getByLabel("Management scenario")).toBeDisabled();
});

test("deck layer renders validated cells with picking and keeps geographic fallback interactive",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  const centerCell={...cell,h3Index:latLngToCell(39.8,-98.5,3)};
  await page.route("https://tiles.openfreemap.org/**",route=>route.abort());
  await page.route("**/api/v1/atlas",route=>route.fulfill({json:{...dataset,cells:[centerCell,{...centerCell,scenarioId:"late",netReturnUsdHa:40}]}}));
  await page.route("**/api/v1/field-conditions?**",route=>route.abort());
  await page.goto("/atlas");
  await page.getByLabel("Atlas layer").selectOption("returns");
  const canvas=page.locator(".map-canvas");
  await expect(canvas).toHaveAttribute("data-atlas-render-mode",/deck|fallback/,{timeout:60000});
  const bounds=await canvas.boundingBox(); if(!bounds) throw Error("Map bounds unavailable");
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await expect(page.getByRole("tooltip")).toContainText("Silt loam");
  await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  const panel=page.getByRole("complementary",{name:"Region overview",exact:true});
  await expect(panel).toContainText("-30 USD/ha");
  await expect(panel).toContainText("Regional soil texture");
  const renderer=await canvas.getAttribute("data-atlas-render-mode");
  console.log(`Atlas renderer: ${renderer}; cold update ${await canvas.getAttribute("data-atlas-layer-update-ms")} ms`);
});

test("selected Atlas region exposes sourced soil horizons and independent missing properties",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.route("https://tiles.openfreemap.org/**",r=>r.abort());
  await page.route("**/api/v1/atlas",r=>r.fulfill({json:{...dataset,cells:[{...cell,h3Index:latLngToCell(39.8,-98.5,3)}]}}));
  await page.route("**/api/v1/field-conditions?**",r=>r.abort());
  await page.route("**/api/v1/soil-profile?**",r=>{
    const q=new URL(r.request().url()).searchParams;
    const m=(value:number|string|null,unit:string)=>({status:value===null?"unavailable":"available",value,unit,source:"USDA NRCS SDA",sourceUrl:"https://sdmdataaccess.sc.egov.usda.gov/",message:"Test fixture only"});
    return r.fulfill({json:{status:"available",message:"Test soil profile",sample:{latitude:Number(q.get("latitude")),longitude:Number(q.get("longitude"))},retrievedAt:"2026-11-14T12:00:00Z",source:"USDA NRCS SDA",sourceUrl:"https://sdmdataaccess.sc.egov.usda.gov/",components:[{mapUnitSymbol:"MU",mapUnitName:"Test mapped soil",componentName:"Test component",componentPercent:70,drainageClass:m("Well drained","class"),hydrologicGroup:m("B","group"),horizons:[{topCm:0,bottomCm:20,texture:m("Silt loam",""),sandPct:m(30,"%"),siltPct:m(50,"%"),clayPct:m(20,"%"),organicMatterPct:m(2,"%"),bulkDensityGcm3:m(1.2,"g/cm³"),ph:m(6.5,"pH"),saturatedConductivityUmS:m(null,"µm/s")}]}]}});
  });
  await page.goto("/atlas");
  await page.getByLabel("Atlas layer").selectOption("returns");
  const map=page.locator(".map-canvas");await expect(map).toHaveAttribute("data-atlas-render-mode",/deck|fallback/,{timeout:60000});
  // The source is committed before the software GPU paints the first frame.
  // Wait for actual map picking instead of racing a click against that frame.
  await expect(async () => {
    const b=await map.boundingBox();if(!b)throw Error("Map bounds unavailable");
    await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
    await expect(page.getByRole("complementary",{name:"Region overview",exact:true})).toBeVisible();
  }).toPass({timeout:15000});
  await page.getByText("Soil texture and horizon characteristics at centre",{exact:true}).click();
  const soil=page.getByRole("region",{name:"Mapped soil profile",exact:true});
  await expect(soil).toContainText("Test mapped soil");await expect(soil).toContainText("6.5 pH");await expect(soil).toContainText("Saturated conductivity");await expect(soil).toContainText("Unavailable");
});
