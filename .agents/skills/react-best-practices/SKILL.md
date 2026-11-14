---
name: react-best-practices
description: >-
  Vercel Engineering performance guidelines for React 19 and Next.js App Router:
  eliminating waterfalls, optimizing server/client boundaries, and preventing re-renders.
---

# React & Next.js Best Practices Skill

Core performance and architecture principles directly aligned with Vercel Engineering standards.

## 1. Eliminate Data Waterfalls

- ❌ **Anti-Pattern**: Fetching parent data, then child data sequentially inside nested `useEffect` hooks.
- ✅ **Fix**: Colocate parallel async fetches in React Server Components using `Promise.all`:

```typescript
export default async function DashboardPage({ params }: { params: { id: string } }) {
  // Parallel fetch without waterfall
  const [field, environment, predictions] = await Promise.all([
    fetchField(params.id),
    fetchEnvironmentData(params.id),
    fetchPredictions(params.id),
  ]);

  return <FieldOverview field={field} env={environment} pred={predictions} />;
}
```

## 2. Server vs Client Boundaries

- Keep Server Components as the default for maximum performance, minimal bundle size, and instant streaming.
- Push `'use client'` down to the leaves of the component tree (e.g., interactive map pins, toggle switches, client chart renderers).
- Pass server-rendered JSX or server data as `children` into client providers to prevent unnecessary client component wrapping.

## 3. Streaming with Suspense

Wrap slower API calls (such as ML inference responses) in `<Suspense>` boundaries with skeleton placeholders:

```typescript
import { Suspense } from "react";
import PredictionCardSkeleton from "@/components/PredictionCardSkeleton";

export default function FieldPage() {
  return (
    <div className="space-y-6">
      <FieldHeader />
      <Suspense fallback={<PredictionCardSkeleton />}>
        <AsyncPredictionSection />
      </Suspense>
    </div>
  );
}
```

## 4. Re-render Prevention & State Colocation

- Do not hoist local interactive state (e.g. tooltip hover, modal visibility) to global stores.
- Use `useTransition` or React 19 Actions for pending mutation states rather than manually managing `const [loading, setLoading] = useState(false)`.

