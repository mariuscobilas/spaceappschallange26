# Meridian

**NASA Space Apps Challenge 2026 — Field Shift**

Meridian is an AI-powered NASA Earth observation and agronomic planning workspace designed to help growers **maximize farm revenue sustainably**. Built with **Next.js**, **FastAPI**, **Mastra**, and **Turborepo**, Meridian fuses satellite imagery, gridded meteorology, USDA soil horizon profiles, custom field geometry, predictive soil-moisture modeling, and an LLM tool-calling agent into a single end-to-end decision workspace.

## Table of Contents

* [1. Problem & Solution Overview](#1-problem--solution-overview)
* [2. Core Capabilities](#2-core-capabilities)
  * [2.1 4-Level H3 Geospatial Explorer & Regional Atlas (`/`)](#21-4-level-h3-geospatial-explorer--regional-atlas-)
  * [2.2 Custom Field Drawing, Calendar Planner & Economics (`/planner/fields`, `/planner`, `/planner/review`, `/economics`)](#22-custom-field-drawing-calendar-planner--economics-plannerfields-planner-plannerreview-economics)
  * [2.3 Predictive ML Engine & Mastra AI Advisor (`apps/web/lib/meridian`)](#23-predictive-ml-engine--mastra-ai-advisor-appsweblibmeridian)
* [3. System Architecture](#3-system-architecture)
* [4. Scope & Scientific Trust Guardrails](#4-scope--scientific-trust-guardrails)
* [5. Quickstart & Environment Setup](#5-quickstart--environment-setup)
* [6. Repository Structure & Documentation Index](#6-repository-structure--documentation-index)
* [7. Team](#7-team)

## 1. Problem & Solution Overview

Planting a cover crop (*"reverse crop"* such as cereal rye or winter pea) protects topsoil, suppresses weeds, and builds organic matter—but in water-limited regions, it also consumes soil moisture needed by the following cash crop (*"money crop"* such as wheat, corn, soybeans, cotton, or sorghum). Getting the balance wrong either forfeits soil health or creates a **"water debt"** that cuts cash-crop yield and farm profitability.

Growers and conservation advisors currently lack a unified tool that connects **what is happening in the atmosphere and soil**, **what future soil moisture looks like under different management choices**, and **how those choices affect net dollars per hectare or acre**.

Meridian solves this in four connected steps:

1. **Observe:** Inspect any U.S. region across a 4-level H3 hexagonal grid and integrated Regional Atlas layers inside **Explore** (`/`), backed by live NASA POWER meteorology, NASA GIBS satellite imagery, U.S. Drought Monitor data, and USDA SSURGO soil profiles.
2. **Delineate & Plan:** Draw custom field boundaries (`/planner/fields`), configure cash-crop planting dates and cover-crop termination lead times (`/planner`), review and compare confirmed plans (`/planner/review`), and model net profit and break-even yield changes (`/economics`).
3. **Predict:** Run historical and current soil/weather data through our ML pipeline (`apps/api/ml`) to forecast future soil moisture trajectories and cash- vs. cover-crop trade-offs.
4. **Advise:** Consult **Meridian**, our **Mastra AI agent** (`apps/web/lib/meridian`), which orchestrates ML predictions, live NASA/USDA environmental tools, and the grower's field economics to explain trade-offs and guide profitable, sustainable decisions.

## 2. Core Capabilities

### 2.1 4-Level H3 Geospatial Explorer & Regional Atlas (`/`)

The **Explore** workspace (`/`) unifies regional satellite/weather inspection and historical cover-crop research in a single map experience. It divides the contiguous United States into a **zoom-adaptive 4-tier H3 hexagonal grid** (Resolutions $2$, $3$, $4$, and viewport-scoped $5$) layered over customizable basemaps (**OpenFreeMap** Light, Streets, Dark; **USGS** Topographic and Aerial imagery), opt-in **NASA GIBS** satellite overlays (**SMAP** surface soil moisture, **VIIRS NDVI** vegetation index, **GPM IMERG** precipitation rate), and the **U.S. Drought Monitor** overlay.

* **Live Hexagon Inspector:** Clicking any hexagon opens a **Hexagon Information** drawer surfacing source-backed environmental conditions at the cell centroid:
  * **Cell Geometry & Grid Context:** Full hexagon area (e.g., $13{,}005.4\text{ km}^2$ at H3 Resolution $3$), centroid coordinates, H3 resolution tier, and Region ID.
  * **NASA POWER Daily Meteorology (`MERRA-2 / GEOS-IT`, $0.5^\circ \times 0.625^\circ$ grid):**
    * **30-Day Cumulative Precipitation ($\text{mm}$):** Sum of $30$ contiguous valid daily precipitation observations.
    * **Root-Zone Relative Wetness ($0\text{--}100\text{ cm}$, $\%$):** Modeled relative saturation fraction.
  * **USDA NRCS Soil Data Access (`SSURGO` Map Unit):**
    * **Available Water Storage ($0\text{--}100\text{ cm}$, $\text{mm}$):** Mapped profile water-storage capacity alongside dominant soil map unit and slope (e.g., *Hall silt loam, $1$ to $3$ percent slopes*).
    * **Soil Texture & Horizon Profile ($0\text{--}30\text{ cm}$):** Drainage class, hydrologic group, Sand ($\%$), Silt ($\%$), Clay ($\%$), Organic Matter ($\%$), Bulk Density ($\text{g/cm}^3$), $\text{pH}$, and Saturated Hydraulic Conductivity ($\mu\text{m/s}$).
* **Integrated Regional Atlas:** Accessible directly within the **Explore** tab, allowing users to inspect historical cover-crop yield impacts across $486$ **counties** in six U.S. Corn Belt states (**Illinois, Indiana, Iowa, Michigan, Missouri, and Ohio**) derived from archived 2019–2020 peer-reviewed research outputs (filterable by corn/soybean and year), alongside optional H3 net-return scenarios (`ATLAS_DATASET_PATH`) and USDA soil horizon diagnostics.

### 2.2 Custom Field Drawing, Calendar Planner & Economics (`/planner/fields`, `/planner`, `/planner/review`, `/economics`)

* **Field Delineation (`/planner/fields`):** Drop exact coordinates or draw and edit custom farm polygons using **Terra Draw**. Geodesic area and centroid are computed locally, paired with on-demand **USDA Cropland Data Layer (CDL)** point crop classification and field-specific NASA POWER + SSURGO metrics.
* **Cover-Crop Calendar Planner (`/planner`):** Pair a cash crop (*wheat, corn, soybeans, cotton, sorghum*) with a cover crop (*cereal rye, winter pea, forage radish, multi-species mix*), set planting dates and termination lead times ($0$ to $60$ days in $5$-day increments), and preserve unfinished working drafts across reloads.
* **Plan Review & Comparison (`/planner/review`):** Inspect confirmed calendar plans, reopen saved configurations, compare two plans side by side, and export structured summaries.
* **Transparent Unit-Economics Calculator (`/economics`):** Calculates net financial return and break-even yield thresholds across both U.S. customary and canonical metric units without zero-filling missing inputs:

$$
\text{Baseline Revenue}_{\text{ha}} = \text{Baseline Yield} \times \text{Commodity Price}
$$

$$
\text{Net Change}_{\text{ha}} = \left(\text{Baseline Revenue}_{\text{ha}} \times \frac{\text{Assumed Yield Change}}{100}\right) - \text{Seed Cost} - \text{Termination Cost} + \text{Support Payment}
$$

$$
\text{Total Net Change} = \text{Net Change}_{\text{ha}} \times \text{Managed Hectares}
$$

$$
\text{Break-Even Yield Change } (\%) = 100 \times \frac{\text{Seed Cost} + \text{Termination Cost} - \text{Support Payment}}{\text{Baseline Revenue}_{\text{ha}}}
$$

* **Local-First Persistence & Workspace Backup:** Works immediately with zero account required; users can export and restore versioned JSON backups covering fields, plans, drafts, economic assumptions, and map preferences.

### 2.3 Predictive ML Engine & Mastra AI Advisor (`apps/web/lib/meridian`)

* **Predictive Soil & Crop ML Models (`apps/api/ml`):** Trained on multi-year field observations (including Clovis, NM moisture series, Colorado yield-difference records, and NASA POWER weather histories) to forecast future soil moisture trajectories and evaluate water-carryover trade-offs between the cash crop ("money crop") and cover crop ("reverse crop") across dry, typical, and wet weather scenarios.
* **Meridian Mastra Agent (`apps/web/lib/meridian`):** Powered by **Mastra** (`AI_AGENT_MODEL=openai/gpt-6.1-terra`), Meridian acts as an interactive agronomic and financial advisor. Using structured tools connected to the FastAPI backend, NASA POWER/USDA SSURGO lookups, ML forecast endpoints, and the user's drawn field/budget state, the agent explains expected soil dynamics and recommends strategies to maximize sustainable revenue while explicitly communicating data provenance and regional generalization limits.

## 3. System Architecture

```text
+-----------------------------------------------------------------------+
|  Next.js Frontend & Mastra AI Workspace (apps/web)                    |
|  - MapLibre GL + deck.gl (4-Level H3 Grid, Atlas, NASA GIBS, USDM)    |
|  - Terra Draw Fields, Calendar Planner, Review & Economics Calculator |
|  - Mastra Agent & Toolset (apps/web/lib/meridian)                     |
+-----------------------------------+-----------------------------------+
                                    | Typed REST / OpenAPI Contracts
                                    v
+-----------------------------------------------------------------------+
|  FastAPI Backend & ML Engine (apps/api)                               |
|  - Environmental Context Proxies (NASA POWER, USDA SSURGO, USDA CDL)  |
|  - Regional Atlas Endpoints (486-County Dataset & H3 Scenarios)       |
|  - Soil Moisture & Crop Trade-Off ML Pipeline (apps/api/ml)           |
+-----------------------------------------------------------------------+
```

## 4. Scope & Scientific Trust Guardrails

Meridian enforces strict provenance and transparency across every layer:

* **Every Metric Carries Provenance:** Displayed environmental numbers always retain their source agency, grid/parcel resolution, observation window, units, and retrieval timestamp.
* **No Silent Fabrication:** Missing satellite or weather observations remain explicitly marked as unavailable—never zero-filled or silently replaced with mock values.
* **Regional Generalization Disclosure:** Field-level ML models trained on specific trial sites (such as Clovis, NM or Colorado dryland records) surface clear regional coverage and uncertainty context when applied to new geographies, so growers can weigh model projections alongside local soil capacity and their own budget assumptions.

## 5. Quickstart & Environment Setup

### Prerequisites

* **Node.js** `20.9+` and **pnpm** `9+`
* **Python** `3.11+`

### 1. Configure Environment Variables

Create a `.env.local` file inside `apps/web` (or `.env` at the repository root) with your OpenAI API key and service URLs:

```env
OPENAI_API_KEY=sk-proj-your-openai-api-key
AI_AGENT_MODEL=openai/gpt-6.1-terra
API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

> **Security Note:** Never commit `.env` or `.env.local` files containing real API keys to version control.

### 2. Install Dependencies

```sh
# Install JavaScript/TypeScript workspace dependencies
pnpm install
```

```sh
# Create and populate the Python FastAPI + ML virtual environment (macOS / Linux)
python3 -m venv apps/api/.venv
apps/api/.venv/bin/python -m pip install -r apps/api/requirements.txt
```

```powershell
# Windows PowerShell alternative
py -m venv apps/api/.venv
apps/api/.venv/Scripts/python.exe -m pip install -r apps/api/requirements.txt
```

### 3. Run Locally

```sh
pnpm dev
```

* **Meridian Web App:** `http://localhost:3000` (e.g., `/`, `/planner/fields`, `/planner`, `/planner/review`, `/economics`)
* **FastAPI Backend & Docs:** `http://localhost:8000` (`http://localhost:8000/docs`)

### 4. Verification & Tests

```sh
pnpm --filter @spaceapps/web exec tsc --noEmit
pnpm --filter @spaceapps/web build
pnpm --filter @spaceapps/web exec playwright install chromium
pnpm --filter @spaceapps/web exec playwright test
```

## 6. Repository Structure & Documentation Index

```text
├── apps/
│   ├── web/
│   │   ├── app/              # Next.js routes (/, /planner, /planner/fields, /planner/review, /economics, /intel)
│   │   └── lib/meridian/     # Mastra AI agent definition, system prompts & agronomic tools
│   └── api/
│       ├── ml/               # Soil moisture & crop trade-off ML models, training & inference
│       └── API.md            # FastAPI endpoint specifications
├── data/research/cover-crops/# Prepared historical cover-crop observations & budget bundle
├── docs/                     # Architecture, PRD, Atlas provenance & ML benchmark reports
└── examples/api/             # Verified JSON request/response payloads
```

### Detailed Technical & Research Documentation

* **Product & Architecture:** [PRD](docs/PRD.md) · [Milestones](docs/MILESTONES.md) · [API Handoff](docs/API_HANDOFF.md) · [OpenAPI Spec](docs/openapi.json) · [Client Delivery](docs/CLIENT-DELIVERY.md) · [Next Product Delivery](docs/PRODUCT-NEXT.md)
* **Geospatial & Atlas Data:** [Regional Atlas Guide](docs/REGIONAL-ATLAS.md) · [Atlas Delivery & Acceptance](docs/ATLAS-DELIVERY.md) · [Map Sources & Drought Data](docs/MAP-DATA.md) · [Research Evidence Bundle](data/research/cover-crops/v1/README.md)
* **ML Benchmarks & Agronomic Research:** [ML Publication](docs/ML_PUBLICATION.md) · [ML Research Plan](docs/ML_RESEARCH_PLAN.md) · [Cover vs. Fallow Evaluation](docs/COVER_FALLOW_EVALUATION.md) · [Mandan Weather Verification](docs/MANDAN_WEATHER_VERIFICATION.md) · [Clovis Model Diagnosis](docs/CLOVIS_MODEL_DIAGNOSIS.md) · [Clovis Scenario Simulation](docs/CLOVIS_SCENARIO_SIMULATION.md) · [Clovis Final Test Evaluation](docs/CLOVIS_FINAL_TEST_EVALUATION.md) · [Kansas-First Scope](KANSAS_FIRST.md) · [Benchmark Findings](BENCHMARK_FINDINGS.md)

## 7. Team

| Member | Role |
| :--- | :--- |
| **Marius** | Fullstack & Lead |
| **Ion** | Backend, Data & Machine Learning |
| **Alexa** | Product Management & Demo |
| **Liza** | Presentation & Visuals |
| **Sergiu** | Data Operations, Location Research & QA |
| **Andrei** | Dataset Preparation & QA |