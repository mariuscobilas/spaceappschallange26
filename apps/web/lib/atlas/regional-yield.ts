"use client";
import { useEffect, useState } from "react";
import type { RegionalYieldDataset, RegionalYieldCrop, RegionalYieldPeriod } from "@spaceapps/shared";

export function validateRegionalYield(value: unknown): value is RegionalYieldDataset {
  if (!value || typeof value !== "object") return false;
  const obj=(v:unknown):v is Record<string,any>=>!!v&&typeof v==="object"&&!Array.isArray(v);
  const keys=(v:Record<string,any>,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
  const str=(v:unknown,min:number,max:number)=>typeof v==="string"&&v.length>=min&&v.length<=max;
  const d=value as Record<string,any>;
  if(!keys(d,["status","message","datasetId","generatedAt","source","method","regions"])||!str(d.message,1,1000)||!Array.isArray(d.regions)||d.regions.length>1000)return false;
  if(d.status==="unavailable") return d.datasetId===null&&d.generatedAt===null&&d.source===null&&d.method===null&&d.regions.length===0;
  if(d.status!=="available"||!str(d.datasetId,1,200)||typeof d.generatedAt!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(d.generatedAt)||!Number.isFinite(Date.parse(d.generatedAt))||!obj(d.source)||!obj(d.method)||d.regions.length===0)return false;
  const source=d.source, method=d.method;
  if(!keys(source,["title","url","doi","archiveSha256","license"])||!str(source.title,1,300)||!str(source.url,9,1000)||!/^https:\/\//i.test(source.url)||!str(source.doi,1,150)||! /^[a-f0-9]{64}$/.test(source.archiveSha256)||!str(source.license,1,150))return false;
  if(!keys(method,["summary","units","sampleUnit","minimumSampleRecords","interpretation","limitations"])||!str(method.summary,1,1000)||method.units!=="percent"||method.sampleUnit!=="model sample record"||method.minimumSampleRecords!==10||!str(method.interpretation,1,1000)||!Array.isArray(method.limitations)||method.limitations.length<1||method.limitations.length>20||!method.limitations.every((v:unknown)=>str(v,1,1000)))return false;
  const statePrefix:Record<string,string>={IA:"19",IL:"17",IN:"18",MI:"26",MO:"29",OH:"39"};
  const validPosition=(pt:unknown)=>Array.isArray(pt)&&pt.length===2&&pt.every((n:unknown)=>typeof n==="number"&&Number.isFinite(n))&&pt[0]>=-125&&pt[0]<=-66&&pt[1]>=24&&pt[1]<=50;
  const validPolygon=(rings:unknown)=>Array.isArray(rings)&&rings.length>0&&rings.every((ring:unknown)=>Array.isArray(ring)&&ring.length>=4&&ring.every(validPosition)&&JSON.stringify(ring[0])===JSON.stringify(ring[ring.length-1]));
  const validGeometry=(geometry:unknown)=>{
    if(!obj(geometry)||!keys(geometry,["type","coordinates"]))return false;
    const polygons=geometry.type==="Polygon"?[geometry.coordinates]:geometry.type==="MultiPolygon"?geometry.coordinates:null;
    if(!Array.isArray(polygons)||!polygons.length||polygons.length>2000)return false;
    let positions=0;
    const valid=polygons.every((poly:unknown)=>Array.isArray(poly)&&poly.length>0&&poly.every((ring:unknown)=>{if(!Array.isArray(ring))return false;positions+=ring.length;return ring.length>=4&&ring.every(validPosition)&&JSON.stringify(ring[0])===JSON.stringify(ring[ring.length-1]);}));
    return valid&&positions<=20000;
  };
  const fips=new Set<string>();
  return d.regions.every((r:unknown)=>{
    if(!obj(r)||!keys(r,["fips","name","state","centroid","geometry","estimates"])||typeof r.fips!=="string"||!/^\d{5}$/.test(r.fips)||fips.has(r.fips)||!str(r.name,1,150)||!statePrefix[r.state]||!r.fips.startsWith(statePrefix[r.state])||!Array.isArray(r.centroid)||r.centroid.length!==2||!r.centroid.every((n:unknown)=>typeof n==="number"&&Number.isFinite(n))||r.centroid[0]<-125||r.centroid[0]>-66||r.centroid[1]<24||r.centroid[1]>50||!validGeometry(r.geometry)||!Array.isArray(r.estimates)||r.estimates.length<1||r.estimates.length>6)return false;
    fips.add(r.fips);const estimateKeys=new Set<string>();
    return r.estimates.every((e:unknown)=>{
      if(!obj(e)||!keys(e,["crop","period","sampleRecords","sampleRecordsByYear","meanYieldEffectPct"])||!["corn","soybeans"].includes(e.crop)||!["2019","2020","2019-2020"].includes(e.period)||!Number.isInteger(e.sampleRecords)||e.sampleRecords<10||!obj(e.sampleRecordsByYear)||!keys(e.sampleRecordsByYear,["2019","2020"])||!Number.isInteger(e.sampleRecordsByYear["2019"])||e.sampleRecordsByYear["2019"]<0||!Number.isInteger(e.sampleRecordsByYear["2020"])||e.sampleRecordsByYear["2020"]<0||e.sampleRecordsByYear["2019"]+e.sampleRecordsByYear["2020"]!==e.sampleRecords||(e.period==="2019"&&e.sampleRecordsByYear["2019"]!==e.sampleRecords)||(e.period==="2020"&&e.sampleRecordsByYear["2020"]!==e.sampleRecords)||typeof e.meanYieldEffectPct!=="number"||!Number.isFinite(e.meanYieldEffectPct)||e.meanYieldEffectPct<=-100)return false;
      const key=`${e.crop}:${e.period}`;if(estimateKeys.has(key))return false;estimateKeys.add(key);return true;
    });
  });
}
const unavailable = (message: string): RegionalYieldDataset => ({ status:"unavailable", message, datasetId:null, generatedAt:null, source:null, method:null, regions:[] });
export function useRegionalYield(enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{attempt:number;data:RegionalYieldDataset;fallback:boolean}>();
  useEffect(() => {
    if (!enabled || state?.attempt === attempt) return;
    let disposed=false; const ctl=new AbortController();
    const base=(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/,"");
    const boundedText=async(response:Response,maxBytes=10*1024*1024):Promise<string>=>{
      const declared=Number(response.headers.get("content-length"));if(Number.isFinite(declared)&&declared>maxBytes)throw Error("Regional yield dataset exceeds the 10 MB limit.");
      if(!response.body){const body=await response.text();if(new TextEncoder().encode(body).byteLength>maxBytes)throw Error("Regional yield dataset exceeds the 10 MB limit.");return body;}
      const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){void reader.cancel();throw Error("Regional yield dataset exceeds the 10 MB limit.");}chunks.push(value);}}
      finally{reader.releaseLock();}
      const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder().decode(joined);
    };
    const request=async(url:string,timeoutMs:number)=>{
      const reqCtl=new AbortController();const abort=()=>reqCtl.abort();ctl.signal.addEventListener("abort",abort,{once:true});const timer=window.setTimeout(()=>reqCtl.abort(),timeoutMs);
      let response:Response;
      try{response=await fetch(url,{signal:reqCtl.signal});}
      catch(error){window.clearTimeout(timer);ctl.signal.removeEventListener("abort",abort);return {transportError:error};}
      try{const text=await boundedText(response);return {response,text};}
      catch(error){return reqCtl.signal.aborted?{transportError:error}:{response,error};}
      finally{window.clearTimeout(timer);ctl.signal.removeEventListener("abort",abort);}
    };
    const local=async()=>{
      const result=await request("/data/regional-yield.json",10000);if("transportError" in result)throw result.transportError;if("error" in result)throw result.error;
      if(!result.response.ok)throw Error("Published county data is unavailable.");
      let value:unknown;try{value=JSON.parse(result.text);}catch{throw Error("Published county data is malformed.");}
      if(!validateRegionalYield(value))throw Error("Published county data failed contract validation.");return value;
    };
    void (async()=>{
      const result=await request(`${base}/api/v1/atlas/regional-yield`,12000);
      if("transportError" in result){if(ctl.signal.aborted)return;try{const data=await local();if(!disposed)setState({attempt,data,fallback:true});}catch{if(!disposed)setState({attempt,data:unavailable("Published county yield estimates are unavailable. Retry to check the source again."),fallback:false});}return;}
      if("error" in result){if(!disposed)setState({attempt,data:unavailable(result.error instanceof Error?result.error.message:"Atlas API county data could not be read."),fallback:false});return;}
      if(!result.response.ok){if(!disposed)setState({attempt,data:unavailable("Atlas API reported county data unavailable."),fallback:false});return;}
      let value:unknown;try{value=JSON.parse(result.text);}catch{if(!disposed)setState({attempt,data:unavailable("Atlas API county data is malformed."),fallback:false});return;}
      if(!validateRegionalYield(value)){if(!disposed)setState({attempt,data:unavailable("Atlas API county data failed contract validation."),fallback:false});return;}
      if(!disposed)setState({attempt,data:value,fallback:false});
    })();
    return()=>{disposed=true;ctl.abort();};
  },[enabled,attempt,state?.attempt]);
  return {data:state?.attempt===attempt?state.data:undefined,sourceFallback:state?.attempt===attempt&&state.fallback,loading:enabled&&state?.attempt!==attempt,retry:()=>setAttempt(n=>n+1)};
}
export type { RegionalYieldCrop, RegionalYieldPeriod };
