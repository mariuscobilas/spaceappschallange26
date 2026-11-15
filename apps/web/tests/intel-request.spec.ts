import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

type StreamChunk = Record<string, unknown>;

function streamResponse(chunks: StreamChunk[]) {
  return {
    status: 200,
    headers: { "x-vercel-ai-ui-message-stream": "v1" },
    contentType: "text/event-stream; charset=utf-8",
    body: `${chunks.map((chunk) => `data:${JSON.stringify(chunk)}\n\n`).join("")}data:[DONE]\n\n`,
  };
}

function textStream(text: string, messageId = "assistant-1") {
  return streamResponse([
    { type: "start", messageId },
    { type: "start-step" },
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: text },
    { type: "text-end", id: "text-1" },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ]);
}

async function seedChatFields(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem("meridian.fields.v1", JSON.stringify({ version: 1, activeFieldId: "north", fields: [
      { id: "north", name: "North field", location: { latitude: 39, longitude: -99 }, currentCrop: "wheat", cropSource: "manual", createdAt: now, updatedAt: now },
      { id: "south", name: "South field", location: { latitude: 38, longitude: -98 }, currentCrop: "corn", cropSource: "manual", createdAt: now, updatedAt: now },
    ] }));
  });
}

async function openPlanForField(page: import("@playwright/test").Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
  await nav.getByRole("link", { name: "Field Planner", exact: true }).click();
  const fields = page.getByRole("region", { name: "Saved fields", exact: true });
  const card = fields.locator('[data-slot="card"]').filter({ has: page.getByText(name, { exact: true }) });
  await card.getByRole("button", { name: /Create plan|Continue draft|Continue plan/ }).click();
  await nav.getByRole("link", { name: "Ask Meridian", exact: true }).click();
  await expect(page.getByRole("heading", { name: name, exact: true })).toBeVisible();
}

test("Meridian streams answers and sends text-only multi-turn history with selected field context", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/chat", async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    const text = requests.length === 1
      ? "Check measured soil water and the planting window before committing."
      : "I will keep that field context in mind.";
    await route.fulfill(streamResponse([
      { type: "start", messageId: `assistant-${requests.length}` },
      { type: "start-step" },
      { type: "text-start", id: `text-${requests.length}` },
      { type: "text-delta", id: `text-${requests.length}`, delta: text },
      { type: "text-end", id: `text-${requests.length}` },
      { type: "finish-step" },
      { type: "finish", finishReason: "stop" },
    ]));
  });

  await page.goto("/intel");
  const composer = page.getByLabel("Message Meridian");
  const send = page.getByRole("button", { name: "Send message" });
  await composer.fill("What should I verify before planting?");
  await send.click();

  const conversation = page.locator('[aria-label="Conversation"]');
  await expect(conversation).toContainText("Check measured soil water and the planting window before committing.");
  const firstMessages = requests[0].messages as Array<{ id: string; role: string; parts: Array<{ type: string; text: string }> }>;
  expect(firstMessages).toHaveLength(1);
  expect(firstMessages[0].role).toBe("user");
  expect(firstMessages[0].parts).toEqual([{ type: "text", text: "What should I verify before planting?" }]);
  expect(requests[0].context).toMatchObject({
    latitude: expect.any(Number),
    longitude: expect.any(Number),
    locationName: expect.any(String),
    crop: expect.any(String),
    observationDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  });

  await composer.fill("And what about soil water?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(conversation).toContainText("I will keep that field context in mind.");
  const secondMessages = requests[1].messages as Array<{ role: string; parts: Array<{ type: string; text: string }> }>;
  expect(secondMessages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
  expect(secondMessages.flatMap((message) => message.parts.map((part) => part.text))).toEqual([
    "What should I verify before planting?",
    "Check measured soil water and the planting window before committing.",
    "And what about soil water?",
  ]);
  expect(secondMessages.every((message) => message.parts.every((part) => part.type === "text"))).toBe(true);
});

test("Meridian can retry after an endpoint error", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/chat", async (route) => {
    calls++;
    if (calls === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporary failure" }) });
      return;
    }
    await route.fulfill(textStream("The service recovered; check current field observations."));
  });
  await page.goto("/intel");
  await page.getByLabel("Message Meridian").fill("What should I check?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator('[role="alert"]').filter({ hasText: "temporary failure" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator('[aria-label="Conversation"]')).toContainText("The service recovered; check current field observations.");
  expect(calls).toBe(2);
});

test("Meridian renders the structured Clovis comparison card from a tool result", async ({ page }) => {
  const result = JSON.parse(readFileSync("../../shared/payloads/clovis-analysis-plant.json", "utf8"));
  result.recommendation.decision = "do_not_plant";
  result.recommendation.message = "Do not plant the selected cover crop.";
  await page.route("**/api/chat", async (route) => {
    await route.fulfill(streamResponse([
      { type: "start", messageId: "assistant-tool" },
      { type: "start-step" },
      { type: "tool-input-available", toolCallId: "call-1", toolName: "runClovisComparison", input: {} },
      { type: "tool-output-available", toolCallId: "call-1", output: { ok: true, result } },
      { type: "finish-step" },
      { type: "finish", finishReason: "stop" },
    ]));
  });
  await page.goto("/intel");
  await page.getByLabel("Message Meridian").fill("Compare a cover crop plan.");
  await page.getByRole("button", { name: "Send message" }).click();
  const conversation = page.locator('[aria-label="Conversation"]');
  await expect(conversation.getByText("Clovis reference simulation", { exact: true })).toBeVisible();
  await expect(conversation).toContainText("Insufficient evidence for a planting recommendation.");
  await expect(conversation).not.toContainText("do_not_plant");
  await expect(conversation).not.toContainText("Do not plant the selected cover crop.");
  await expect(conversation).toContainText("moisture-to-yield conversion is illustrative only");
  await expect(conversation).not.toContainText("positive incremental return in all cases");
  await expect(conversation).toContainText("Quality: invalid");
  await expect(conversation).toContainText("Simulation inputs");
});

test("mobile chat composer keeps Shift+Enter line breaks and sends the multiline question", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let submittedText = "";
  await page.route("**/api/chat", async (route) => {
    const request = route.request().postDataJSON() as { messages: Array<{ parts: Array<{ text: string }> }> };
    submittedText = request.messages.at(-1)?.parts.map((part) => part.text).join("") ?? "";
    await route.fulfill(textStream("I received your two-line question."));
  });
  await page.goto("/intel");
  const composer = page.getByLabel("Message Meridian");
  await expect(composer).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await composer.fill("First line");
  await composer.press("Shift+Enter");
  await composer.pressSequentially("Second line");
  await expect(composer).toHaveValue("First line\nSecond line");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator('[aria-label="Conversation"]')).toContainText("I received your two-line question.");
  expect(submittedText).toBe("First line\nSecond line");
});

test("Meridian starts a fresh conversation without previous messages", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill(textStream("Please check the field observations."));
  });
  await page.goto("/intel");
  await page.getByLabel("Message Meridian").fill("First question");
  await page.getByRole("button", { name: "Send message" }).click();
  const conversation = page.locator('[aria-label="Conversation"]');
  await expect(conversation).toContainText("Please check the field observations.");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await expect(conversation).not.toContainText("First question");
  await expect(conversation).toContainText("What would you like to understand about this field?");
});

test("field navigation keeps conversations isolated when an older request finishes late", async ({ page }) => {
  let requestCount = 0;
  let releasePending: (() => void) | undefined;
  let pendingRoute: import("@playwright/test").Route | undefined;
  await page.route("**/api/chat", async (route) => {
    requestCount++;
    const body = route.request().postDataJSON() as { context: { locationName: string } };
    if (requestCount === 1) {
      await route.fulfill(textStream(`Saved reply for ${body.context.locationName}.`));
      return;
    }
    pendingRoute = route;
    await new Promise<void>((resolve) => { releasePending = resolve; });
    try {
      await route.fulfill(textStream(`Late reply for ${body.context.locationName}.`, "late-assistant"));
    } catch {
      // The chat session may abort this response when its field context unmounts.
    }
  });
  await seedChatFields(page);
  await page.goto("/intel");
  await expect(page.getByRole("heading", { name: "North field", exact: true })).toBeVisible();
  await page.getByLabel("Message Meridian").fill("Remember this field");
  await page.getByRole("button", { name: "Send message" }).click();
  let conversation = page.locator('[aria-label="Conversation"]');
  await expect(conversation).toContainText("Saved reply for North field.");

  await page.getByLabel("Message Meridian").fill("This one will finish late");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => pendingRoute).toBeDefined();

  await openPlanForField(page, "South field");
  conversation = page.locator('[aria-label="Conversation"]');
  await expect(conversation).not.toContainText("Remember this field");
  await expect(conversation).not.toContainText("Saved reply for North field.");
  releasePending?.();
  await expect.poll(() => pendingRoute?.request().failure()).not.toBeNull();

  await openPlanForField(page, "North field");
  conversation = page.locator('[aria-label="Conversation"]');
  await expect(conversation).toContainText("Remember this field");
  await expect(conversation).toContainText("Saved reply for North field.");
  await expect(conversation).not.toContainText("Late reply for North field.");
});

test("Stop cancels an in-flight chat response and leaves the composer usable", async ({ page }) => {
  let releasePending: (() => void) | undefined;
  let pendingRoute: import("@playwright/test").Route | undefined;
  let handlerDone: (() => void) | undefined;
  const finished = new Promise<void>((resolve) => { handlerDone = resolve; });
  await page.route("**/api/chat", async (route) => {
    pendingRoute = route;
    await new Promise<void>((resolve) => { releasePending = resolve; });
    try {
      await route.fulfill(textStream("This response should be stopped."));
    } catch {
      // The browser request is expected to be aborted by Stop.
    } finally {
      handlerDone?.();
    }
  });
  await page.goto("/intel");
  await page.getByLabel("Message Meridian").fill("Stop this request");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => pendingRoute).toBeDefined();
  await page.getByRole("button", { name: "Stop response" }).click();
  const composer = page.getByLabel("Message Meridian");
  await expect(composer).toBeEnabled();
  await composer.fill("A follow-up after stopping");
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  releasePending?.();
  await finished;
  const conversation = page.locator('[aria-label="Conversation"]');
  await expect(conversation).toContainText("Stop this request");
  await expect(conversation).not.toContainText("This response should be stopped.");
});
