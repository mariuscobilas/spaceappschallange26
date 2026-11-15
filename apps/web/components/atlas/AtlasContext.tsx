"use client";
import { createContext, useContext } from "react";
import type { AtlasCell, AtlasDataset, AtlasScenario } from "@spaceapps/shared";
import type { RegionalYieldDataset, RegionalYieldCrop, RegionalYieldPeriod } from "@spaceapps/shared";
export type AtlasState = { data?: AtlasDataset; loading: boolean; retry: () => void; scenario?: AtlasScenario; scenarioId: string; setScenarioId: (id: string) => void; cells: AtlasCell[]; renderer: string; layerMode:"yield"|"returns"; setLayerMode:(mode:"yield"|"returns")=>void; regional?:RegionalYieldDataset; regionalLoading:boolean; regionalFallback:boolean; retryRegional:()=>void; countyCrop:RegionalYieldCrop; setCountyCrop:(crop:RegionalYieldCrop)=>void; countyPeriod:RegionalYieldPeriod; setCountyPeriod:(period:RegionalYieldPeriod)=>void; selectedFips?:string; setSelectedFips:(fips?:string)=>void; fitCounties:()=>void; regionalLayer?:{data:RegionalYieldDataset;crop:RegionalYieldCrop;period:RegionalYieldPeriod;selectedFips?:string;fitNonce:number}|null };
export const AtlasContext = createContext<AtlasState | null>(null);
export const useAtlasState = () => useContext(AtlasContext);
