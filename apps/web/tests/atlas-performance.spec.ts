import { expect, test } from "@playwright/test";
import { gridDisk, latLngToCell } from "h3-js";

test("records Atlas filter update and interaction frame timing on a bounded test dataset", async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const indexes=gridDisk(latLngToCell(39.8,-98.5,4),15);
  const cells=["early","late"].flatMap(scenarioId=>indexes.map((h3Index,i)=>({h3Index,crop:"wheat",scenarioId,activeAreaHa:100,netReturnUsdHa:scenarioId==="early"?i%400-200:200-i%400,yieldPenaltyPct:5,rootZoneWetness:.42,soilTexture:"Test texture"})));
  await page.route("https://tiles.openfreemap.org/**",r=>r.abort());
  await page.route("**/api/v1/atlas",r=>r.fulfill({json:{status:"available",message:"Synthetic test fixture ONLY",datasetId:"performance-test-only",generatedAt:"2026-11-14T10:00:00Z",validation:{status:"validated",method:"Software performance fixture",reference:"Not agronomic evidence"},scenarios:["early","late"].map(id=>({id,label:id,baseline:"Test baseline",periodStart:"2025-01-01",periodEnd:"2025-12-31"})),cells,provenance:[{title:"Software test only",url:"https://example.org/test-only",spatialMeaning:"H3 test cells"}]}}));
  await page.goto("/atlas");
  await page.getByLabel("Atlas layer").selectOption("returns");
  const map=page.locator(".map-canvas");
  await expect(map).toHaveAttribute("data-atlas-render-mode","deck",{timeout:60000});
  const coldMs=Number(await map.getAttribute("data-atlas-layer-update-ms"));
  await page.evaluate(()=>{(window as any).__atlasPerfStart=performance.now();});
  await page.getByLabel("Management scenario").selectOption("late");
  await expect(map).toHaveAttribute("data-atlas-scenario-id", "late");
  // Wait for a committed layer update; no provider/network request is needed for filtering.
  await expect.poll(async()=>Number(await map.getAttribute("data-atlas-layer-update-ms"))).toBeLessThan(300);
  const warmMs=Number(await map.getAttribute("data-atlas-layer-update-ms"));
  await page.evaluate(()=>{ const stamps:number[]=[]; (window as any).__atlasFrames=stamps; const start=performance.now(); const tick=(t:number)=>{stamps.push(t);if(t-start<2500)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  const b=await map.boundingBox(); if(!b)throw Error("map bounds missing");
  await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.65,b.y+b.height*.6,{steps:50});await page.mouse.up();
  await page.waitForTimeout(2600);
  const timings=await page.evaluate(()=>{const t:number[]=(window as any).__atlasFrames;const gaps=t.slice(1).map((n,i)=>n-t[i]).sort((a,b)=>a-b);return{frameSamples:t.length,averageRafFps:1000*(t.length-1)/(t.at(-1)!-t[0]),p95FrameMs:gaps[Math.floor(gaps.length*.95)]};});
  const result={renderer:"deck",cellsPerLayer:indexes.length,totalRecords:cells.length,viewport:"1440x960",environment:"Chromium software WebGL (Playwright SwiftShader), development server",coldLayerSetupMs:coldMs,warmLayerSetupMs:warmMs,...timings,targetLayerSetupMs:300,targetFps:60,note:"rAF responsiveness during pan is not a GPU throughput guarantee; software fixture only"};
  console.log(JSON.stringify(result));
  await testInfo.attach("atlas-performance.json",{body:JSON.stringify(result,null,2),contentType:"application/json"});
  expect(warmMs).toBeLessThan(300);
});
