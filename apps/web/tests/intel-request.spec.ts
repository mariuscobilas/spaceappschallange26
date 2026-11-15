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
  await expect(page.getByLabel("Active field")).toHaveValue(name === "North field" ? "north" : "south");
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

test("chat saves transcript on the device and renders Markdown without enabling raw HTML", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill(textStream("**Evidence**\n\n| Source | Status |\n| --- | --- |\n| NASA | Available |\n\n<script>window.__rawHtml = true</script>"));
  });
  await page.goto("/intel");
  await page.getByLabel("Message Meridian").fill("Show sources as a table. Keep <img src=x onerror=alert(1)> literal.");
  await page.getByRole("button", { name: "Send message" }).click();
  const conversation = page.locator('[aria-label="Conversation"]');
  await expect(conversation.locator("strong")).toContainText("Evidence");
  await expect(conversation.locator("table")).toContainText("NASA");
  await expect(conversation.locator("script")).toHaveCount(0);
  await expect(conversation.locator("img")).toHaveCount(0);
  await expect(conversation).toContainText("<img src=x onerror=alert(1)>");
  await expect(conversation).toContainText("<script>window.__rawHtml = true</script>");
  await expect(conversation).toContainText("Show sources as a table.");
  const restored = await page.context().newPage();
  await restored.goto("/intel");
  await expect(restored.locator('[aria-label="Conversation"]')).toContainText("Show sources as a table.");
  await expect(restored.locator('[aria-label="Conversation"]')).toContainText("NASA");
  await restored.getByRole("button", { name: "Clear selected conversation history" }).click();
  await expect(restored.locator('[aria-label="Conversation"]')).not.toContainText("Show sources as a table.");
  await restored.close();
});

test("malformed persisted tool results are rejected with a visible recovery message", async ({ page }) => {
  await seedChatFields(page);
  await page.addInitScript(() => {
    localStorage.setItem("meridian.intel-conversation.v1:meridian-intel:north", JSON.stringify({
      id: "broken-chat", messages: [{ id: "broken-message", role: "assistant", parts: [
        { type: "tool-preparePlanDraft", state: "output-available", output: { ok: true, result: {} } },
      ] }],
    }));
  });
  await page.goto("/intel");
  const conversation = page.locator('[aria-label="Conversation"]');
  await expect(conversation).toContainText("What would you like to understand about this field?");
  await expect(conversation).toContainText("Saved chat history was incomplete or malformed");
  await expect(conversation.getByRole("region", { name: "Proposed plan draft" })).toHaveCount(0);
});

test("malformed nested Clovis results cannot break the conversation composer", async ({ page }) => {
  await seedChatFields(page);
  await page.addInitScript(() => {
    localStorage.setItem("meridian.intel-conversation.v1:meridian-intel:north", JSON.stringify({ id: "bad-clovis-chat", messages: [{ id: "bad-clovis", role: "assistant", parts: [
      { type: "tool-runClovisComparison", state: "output-available", output: { ok: true, result: {
        request: { scenario: {}, economics: {}, risk_rules: {} }, model: {}, initial_moisture: {}, recommendation: {}, financial_summary: {}, assumptions: [],
        scenarios: [{ scenario: "dry", moisture: null, quality: null, water_risk: null, finances: null }, { scenario: "typical", moisture: {}, quality: {}, water_risk: {}, finances: {} }, { scenario: "very_rainy", moisture: {}, quality: {}, water_risk: {}, finances: {} }],
      } } },
    ] }] }));
  });
  await page.goto("/intel");
  await expect(page.locator('[aria-label="Conversation"]')).toContainText("Saved chat history was incomplete or malformed");
  await expect(page.getByLabel("Message Meridian")).toBeEnabled();
});

test("planning-year and budget context edits keep the selected field conversation", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    await route.fulfill(textStream(`Context check ${requests.length} · ${String((body.context as Record<string, unknown>).planningYear)}.`));
  });
  await seedChatFields(page);
  await page.goto("/intel");
  await expect(page.getByLabel("Active field")).toHaveValue("north");
  await page.getByLabel("Message Meridian").fill("Remember this field context");
  await page.getByRole("button", { name: "Send message" }).click();
  const conversation = page.locator('[aria-label="Conversation"]');
  await expect(conversation).toContainText("Context check 1");
  await page.getByLabel("Planning year").fill("2027");
  await page.getByLabel("Message Meridian").fill("Now use the 2027 planning context");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(conversation).toContainText("Context check 2 · 2027");
  await expect(conversation).toContainText("Remember this field context");
  expect((requests[1].context as Record<string, unknown>).planningYear).toBe(2027);
  await page.goto("/economics");
  await page.locator("#economics-grainPrice").fill("245");
  await page.goto("/intel");
  await expect(page.locator('[aria-label="Conversation"]')).toContainText("Remember this field context");
  await page.getByLabel("Message Meridian").fill("Use my updated field budget");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator('[aria-label="Conversation"]')).toContainText("Context check 3 · 2027");
  expect((requests[2].context as Record<string, unknown>).economicsDraft).toMatchObject({ grainPrice: "245" });
});

test("remembered season facts bind to the current user turn and restore on reload", async ({ page }) => {
  await seedChatFields(page);
  await page.route("**/api/chat", async (route) => {
    const request = route.request().postDataJSON() as { context: Record<string, unknown>; messages: Array<{ id: string; role: string; parts: Array<{ text: string }> }> };
    const user = request.messages.at(-1)!;
    const quote = user.parts.map((part) => part.text).join(" ");
    const planningYear = Number(quote.match(/20\d{2}/)?.[0] ?? 2027);
    await route.fulfill(streamResponse([
      { type: "start", messageId: "assistant-fact" }, { type: "start-step" },
      { type: "tool-input-available", toolCallId: "fact-1", toolName: "rememberSeasonFacts", input: { planningYear, irrigation: "available", sourceQuote: quote } },
      { type: "tool-output-available", toolCallId: "fact-1", output: { ok: true, result: { fieldId: request.context.fieldId, planningYear, irrigation: { status: "available" }, sourceMessageId: user.id, contextVersion: request.context.contextVersion, sourceQuote: quote } } },
      { type: "finish-step" }, { type: "finish", finishReason: "stop" },
    ]));
  });
  await page.goto("/intel");
  await page.getByLabel("Planning year").fill("2027");
  await page.getByLabel("Message Meridian").fill("For 2027 irrigation is available.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator('[aria-label="Conversation"]')).toContainText("Remembered 2027 irrigation status: available");
  await expect(page.locator('[aria-label="Conversation"]')).toContainText("available on this device.");
  await expect(page.getByLabel("Remembered irrigation status")).toHaveValue("available");
  await page.reload();
  await expect(page.getByLabel("Planning year")).toHaveValue("2027");
  await expect(page.getByLabel("Remembered irrigation status")).toHaveValue("available");
  await expect(page.locator('[aria-label="Conversation"]')).toContainText("available on this device.");
  await page.getByLabel("Planning year").fill("2028");
  await page.getByLabel("Message Meridian").fill("For 2028 irrigation is available.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator('[aria-label="Conversation"]')).toContainText("Remembered 2028 irrigation status: available");
  await page.reload();
  await expect(page.getByLabel("Planning year")).toHaveValue("2028");
  await expect(page.getByLabel("Remembered irrigation status")).toHaveValue("available");
});

test("plan proposals require Apply, support Discard, and reject stale context", async ({ page }) => {
  await seedChatFields(page);
  let proposalId = 0;
  await page.route("**/api/chat", async (route) => {
    proposalId++;
    const request = route.request().postDataJSON() as { context: Record<string, unknown> };
    const proposal = { id: `proposal-${proposalId}`, fieldId: request.context.fieldId, contextVersion: request.context.contextVersion, changes: { coverCrop: "pea", terminationDays: 25, notes: `Draft ${proposalId}` } };
    await route.fulfill(streamResponse([
      { type: "start", messageId: `assistant-proposal-${proposalId}` }, { type: "start-step" },
      { type: "tool-input-available", toolCallId: `proposal-${proposalId}`, toolName: "preparePlanDraft", input: { changes: proposal.changes } },
      { type: "tool-output-available", toolCallId: `proposal-${proposalId}`, output: { ok: true, result: proposal } },
      { type: "finish-step" }, { type: "finish", finishReason: "stop" },
    ]));
  });
  await page.goto("/intel");
  const composer = page.getByLabel("Message Meridian");
  await composer.fill("Prepare a draft"); await page.getByRole("button", { name: "Send message" }).click();
  const firstProposal = page.getByRole("region", { name: "Proposed plan draft" }).first();
  await expect(firstProposal).toContainText("Draft 1");
  await firstProposal.getByRole("button", { name: "Discard" }).click();
  await expect(firstProposal).toContainText("Proposal discarded.");
  await expect(page.getByRole("button", { name: "Stop response" })).toHaveCount(0);
  await composer.fill("Prepare another draft");
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await page.getByRole("button", { name: "Send message" }).click();
  const secondProposal = page.getByRole("region", { name: "Proposed plan draft" }).last();
  await expect(secondProposal).toContainText("Draft 2");
  await page.getByLabel("Planning year").fill("2027");
  await secondProposal.getByRole("button", { name: "Apply to plan draft" }).click();
  await expect(secondProposal).toContainText("This proposal is out of date");
  await composer.fill("Prepare a current draft");
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await page.getByRole("button", { name: "Send message" }).click();
  const thirdProposal = page.getByRole("region", { name: "Proposed plan draft" }).last();
  await thirdProposal.getByRole("button", { name: "Apply to plan draft" }).click();
  await expect(thirdProposal).toContainText("Applied to the editable plan draft");
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
  await expect(page.getByLabel("Active field")).toHaveValue("north");
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
