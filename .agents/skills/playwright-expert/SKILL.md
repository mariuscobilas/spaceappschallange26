---
name: playwright-expert
description: >-
  End-to-end browser testing with Playwright: validating frontend forms, map interactions,
  API mock/real integration, and automated smoke test execution.
---

# Playwright E2E Testing Skill

Runbook for writing and executing end-to-end browser tests to verify frontend and backend interaction.

## Setup & Execution

```bash
# Run tests using pnpm
pnpm exec playwright test

# Run specific test file in UI mode
pnpm exec playwright test tests/e2e/field-analysis.spec.ts --ui

# Inspect browser interactions in debug mode
pnpm exec playwright test --debug
```

## Writing Resilient E2E Tests

1. **Use User-Facing Locators**:
   - Prefer `getByRole("button", { name: "Run Analysis" })`, `getByLabel("Field Name")`, `getByText(...)`.
   - Avoid brittle CSS selectors like `.css-19v82` or complex XPath expressions.
2. **API Mocking vs Real Endpoints**:
   - For fast frontend-only testing, intercept requests with `page.route()`:
     ```typescript
     import { test, expect } from "@playwright/test";
     import mockResponse from "../../shared/payloads/field-analysis-response.json";

     test("submits field and displays adaptation recommendations", async ({ page }) => {
       await page.route("**/api/v1/field-shift/analyze", (route) => {
         route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockResponse) });
       });

       await page.goto("http://localhost:3000");
       await page.getByRole("button", { name: /analyze/i }).click();
       await expect(page.getByText(/Grain Sorghum/i)).toBeVisible();
     });
     ```
3. **Wait for Network Idle**:
   - Let Next.js streaming boundaries resolve before asserting on async prediction cards.

