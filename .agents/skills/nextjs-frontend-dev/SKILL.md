---
name: nextjs-frontend-dev
description: >-
  Use this skill when building, styling, or debugging frontend components, pages,
  data fetching, or API clients in apps/web with Next.js and React 19.
---

# Next.js Frontend Development Skill

Guides the frontend engineer and agents in developing modern, accessible, and high-performance UI in `apps/web`.

## Key Commands & Setup

```bash
# Run web app in dev mode (port 3000)
pnpm --filter @spaceapps/web dev
# Or run all apps together from root
pnpm dev

# Build the web application
pnpm --filter @spaceapps/web build
```

## Structure of `apps/web`

```text
apps/web/
├── app/
│   ├── layout.tsx         # Root layout with HTML/Body wrapper
│   ├── page.tsx           # Main landing / dashboard page
│   └── globals.css        # Global CSS and styling
├── lib/                   # API clients and utility helpers
├── components/            # Reusable UI components
├── package.json           # Dependencies (React 19, Next.js 16)
└── tsconfig.json          # TypeScript config (with @spaceapps/shared path)
```

## Frontend Standards

1. **Shared Types**:
   - Always import domain types and API contracts from `@spaceapps/shared`:
     ```typescript
     import type { FieldAnalysisRequest, FieldAnalysisResponse } from "@spaceapps/shared";
     ```
2. **Environment Variables**:
   - Store API base URL in `.env.local`:
     ```bash
     NEXT_PUBLIC_API_URL=http://localhost:8000
     ```
   - Default to `http://localhost:8000` if the environment variable is unset.
3. **Graceful Fallbacks & Offline Mode**:
   - If the FastAPI backend is not yet started, gracefully render fallback data so the UI remains operable during local frontend work or demonstrations.
4. **React 19 & Next.js App Router**:
   - Use Server Components by default for initial page data loading and SEO.
   - Use Client Components (`'use client'`) only when handling state, event listeners, or interactive map controls.

See [api-client.ts](./examples/api-client.ts) for a production-ready API fetch client with fallback support.

