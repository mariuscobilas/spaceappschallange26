import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

type StreamChunk = Record<string, unknown>;

function toolStream(output: unknown) {
  const chunks: StreamChunk[] = [
    { type: "start", messageId: "assistant-crop-comparison" },
    { type: "start-step" },
    { type: "tool-input-available", toolCallId: "crop-comparison-1", toolName: "compareCropScenarios", input: { overrides: [] } },
    { type: "tool-output-available", toolCallId: "crop-comparison-1", output },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ];
  return {
    status: 200,
    headers: { "x-vercel-ai-ui-message-stream": "v1" },
    contentType: "text/event-stream; charset=utf-8",
    body: `${chunks.map((chunk) => `data:${JSON.stringify(chunk)}\n\n`).join("")}data:[DONE]\n\n`,
  };
}

test("cash crop comparison renders source, years, expandable details, and fits mobile chat", async ({ page }) => {
  const result = JSON.parse(readFileSync("../../shared/payloads/meridian-crop-comparison-result.json", "utf8"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/chat", (route) => route.fulfill(toolStream({ ok: true, result })));

  await page.goto("/intel");
  const composer = page.getByLabel("Message Meridian");
  await expect(composer).toBeVisible();
  await composer.fill("Show me the cash crop comparison.");
  await page.getByRole("button", { name: "Send message" }).click();

  const conversation = page.locator('[aria-label="Conversation"]');
  const comparison = conversation.getByRole("region", { name: "Cash crop comparison" });
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText("USDA ERS reference year 2025");
  await expect(comparison).toContainText("planning year 2027");

  const table = comparison.getByRole("table");
  await expect(table.getByRole("columnheader", { name: /Gross revenue/ })).toBeVisible();
  await expect(table.getByRole("row", { name: /wheat/ })).toContainText("3.2 t/ha");
  await expect(table.getByRole("row", { name: /wheat/ })).toContainText("220 USD/t");

  await comparison.getByText("Break-even values", { exact: true }).click();
  await expect(comparison).toContainText("price 140.63 USD/t");
  await comparison.getByText("Sources, inputs, and assumptions", { exact: true }).click();
  const source = comparison.getByRole("link", { name: "USDA ERS source" });
  await expect(source).toHaveAttribute("href", "https://www.ers.usda.gov/media/4978/wheat.csv?v=86392");
  await expect(comparison).toContainText("Historical realized estimates are not forecasts.");

  await expect(composer).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
