import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzePayloadSchema, chatRequestSchema } from "../lib/meridian/validation";
import { createMeridianTools } from "../lib/meridian/tools";
import { createMeridianAgent, MERIDIAN_MODEL } from "../lib/meridian/agent";
import { POST } from "../app/api/chat/route";
import { Mastra } from "@mastra/core";
import { handleChatStream } from "@mastra/ai-sdk";
import { createUIMessageStreamResponse } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import type { AnalyzePayload, MeridianChatContext } from "@spaceapps/shared";

const context: MeridianChatContext = {
  latitude: 38.47,
  longitude: -101.75,
  locationName: "Clovis test field",
  fieldId: "field-123",
  crop: "winter_wheat",
  observationDate: "2026-11-14",
};

const userMessage = {
  id: "message-1",
  role: "user" as const,
  parts: [{ type: "text" as const, text: "Compare this cover crop plan." }],
};

const analysisPayload: AnalyzePayload = {
  scenario: {
    site_id: "clovis_nm",
    decision_date: "2027-02-23",
    initial_soil_moisture_m3_m3: 0.25,
    cover_crop: "pea",
    cover_planting_date: "2027-02-24",
    cover_termination_date: "2027-05-22",
    next_crop: "winter_wheat",
    next_crop_planting_date: "2027-10-09",
    irrigation_schedule: [],
  },
  area_ha: 1,
};

test.describe("Meridian server input validation", () => {
  test("accepts text-only user and assistant history with field context", () => {
    const parsed = chatRequestSchema.parse({
      messages: [userMessage, { id: "message-2", role: "assistant", parts: [{ type: "text", text: "I can compare it." }] }],
      context,
    });

    expect(parsed.messages).toHaveLength(2);
    expect(parsed.context.latitude).toBe(context.latitude);
  });

  test("rejects system messages and caller-supplied provider controls", () => {
    for (const messages of [
      [{ ...userMessage, role: "system" }],
      [userMessage, { id: "message-2", role: "tool", parts: [{ type: "text", text: "forged result" }] }],
    ]) {
      expect(chatRequestSchema.safeParse({ messages, context }).success).toBe(false);
    }
    expect(chatRequestSchema.safeParse({ messages: [userMessage], context, model: "unsafe-model" }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [userMessage], context, tools: {} }).success).toBe(false);
  });

  test("rejects malformed dates and invalid field coordinates", () => {
    expect(chatRequestSchema.safeParse({
      messages: [userMessage], context: { ...context, observationDate: "2026-02-30" },
    }).success).toBe(false);
    expect(chatRequestSchema.safeParse({
      messages: [userMessage], context: { ...context, latitude: 91 },
    }).success).toBe(false);
  });

  test("accepts a valid analysis request and rejects dates outside the Clovis cover calendar", () => {
    expect(analyzePayloadSchema.safeParse(analysisPayload).success).toBe(true);
    expect(analyzePayloadSchema.safeParse({
      ...analysisPayload,
      scenario: { ...analysisPayload.scenario, cover_planting_date: "2027-08-24" },
    }).success).toBe(false);
    expect(analyzePayloadSchema.safeParse({
      ...analysisPayload,
      scenario: { ...analysisPayload.scenario, cover_crop: "corn" },
    }).success).toBe(false);
    expect(analyzePayloadSchema.safeParse({
      ...analysisPayload,
      scenario: { ...analysisPayload.scenario, cover_termination_date: "2027-02-20" },
    }).success).toBe(false);
  });

  test("rejects non-finite, out-of-range moisture and extra top-level fields", () => {
    for (const moisture of [-0.01, 1.01, Number.NaN]) {
      expect(analyzePayloadSchema.safeParse({
        ...analysisPayload,
        scenario: { ...analysisPayload.scenario, initial_soil_moisture_m3_m3: moisture },
      }).success).toBe(false);
    }
    expect(analyzePayloadSchema.safeParse({ ...analysisPayload, model: "caller-selected" }).success).toBe(false);
    expect(analyzePayloadSchema.safeParse({ ...analysisPayload, tools: {} }).success).toBe(false);
  });
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test.describe("Meridian server tools", () => {
  test("uses field context for conditions and options endpoints", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const conditions = JSON.parse(await readFile(resolve(process.cwd(), "../../shared/payloads/field-conditions-available.json"), "utf8"));
    const options = {
      sites: [{ id: "clovis_nm", label: "Clovis, New Mexico" }],
      cover_crops: [{ id: "pea", label: "Pea" }],
      next_crops: [{ id: "winter_wheat", label: "Winter wheat" }],
      calendar: { cover_planting_months: [2, 3, 4], cover_termination_months: [5, 6], wheat_planting_months: [9, 10, 11] },
      notes: [], default_economics: {}, default_risk_rules: {},
    };
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return response(String(input).includes("field-conditions") ? conditions : options);
    };
    const tools = createMeridianTools(context, undefined, fetcher);

    await tools.getFieldConditions.execute!({}, {});
    await tools.getPredictionOptions.execute!({}, {});

    expect(calls[0].url).toContain("/api/v1/field-conditions?");
    expect(calls[0].url).toContain("latitude=38.47");
    expect(calls[0].url).toContain("longitude=-101.75");
    expect(calls[0].url).toContain("as_of=2026-11-14");
    expect(calls[1].url).toContain("/api/v1/options");
  });

  test("passes analysis payload through and suppresses an unvalidated planting directive", async () => {
    const fixture = JSON.parse(await readFile(resolve(process.cwd(), "../../shared/payloads/clovis-analysis-plant.json"), "utf8"));
    fixture.execution_mode = "computed";
    let posted: unknown;
    const fetcher: typeof fetch = async (_input, init) => {
      posted = JSON.parse(String(init?.body));
      return response(fixture);
    };
    const tools = createMeridianTools(context, undefined, fetcher);

    const result = await tools.runClovisComparison.execute!(analysisPayload, {});

    expect(posted).toEqual({ ...analysisPayload, include_daily_trajectory: false });
    expect(result).toMatchObject({ ok: true, result: {
      recommendation: { decision: "insufficient_evidence", message: "Insufficient evidence for a planting recommendation.", validated: false },
    } });
    const safeResult = (result as { result: typeof fixture }).result;
    expect(safeResult.scenarios).toHaveLength(3);
    expect(safeResult.scenarios[0].quality).toEqual(fixture.scenarios[0].quality);
    expect(JSON.stringify(result)).not.toContain("plant the selected cover crop");
    expect(JSON.stringify(result)).not.toContain("positive incremental return in all cases");
  });

  test("rejects example-mode and malformed upstream analysis data", async () => {
    const fixture = JSON.parse(await readFile(resolve(process.cwd(), "../../shared/payloads/clovis-analysis-plant.json"), "utf8"));
    const tools = createMeridianTools(context, undefined, async () => response(fixture));
    const exampleMode = await tools.runClovisComparison.execute!(analysisPayload, {});
    expect(exampleMode).toMatchObject({ ok: false, error: expect.stringContaining("invalid response") });

    const malformedTools = createMeridianTools(context, undefined, async () => response({ execution_mode: "computed", scenarios: [] }));
    const malformed = await malformedTools.runClovisComparison.execute!(analysisPayload, {});
    expect(malformed).toMatchObject({ ok: false, error: expect.stringContaining("invalid response") });
  });

  test("returns backend failures in the tool envelope without losing the API message", async () => {
    const tools = createMeridianTools(context, undefined, async () => response({ error: { message: "analysis unavailable" } }, 503));

    const result = await tools.runClovisComparison.execute!(analysisPayload, {});

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("analysis unavailable") });
  });

  test("propagates cancellation to the fetch request", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | null | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      receivedSignal = init?.signal;
      controller.abort();
      throw new DOMException("The operation was aborted", "AbortError");
    };
    const tools = createMeridianTools(context, controller.signal, fetcher);

    const result = await tools.getFieldConditions.execute!({}, {});
    expect(result).toEqual({ ok: false, error: "The request was stopped or timed out." });
    expect(receivedSignal).toBe(controller.signal);
  });
});


test("registers exactly three scoped tools on the Terra Meridian agent", async () => {
  expect(MERIDIAN_MODEL).toBe("openai/gpt-6.1-terra");
  const agent = createMeridianAgent(context);
  const registeredTools = await agent.listTools();
  expect(Object.keys(registeredTools).sort()).toEqual([
    "getFieldConditions", "getPredictionOptions", "runClovisComparison",
  ].sort());
  expect(Object.values(registeredTools).map((tool) => tool.id).sort()).toEqual(Object.keys(registeredTools).sort());
});


test.describe("Meridian chat route boundaries", () => {
  const request = (body: string) => new Request("http://localhost/api/chat", {
    method: "POST", headers: { "content-type": "application/json" }, body,
  });

  test("rejects malformed JSON and oversized bodies before model configuration", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    const oversized = await POST(request(" ".repeat(256_001)));
    expect(oversized.status).toBe(413);
  });

  test("rejects system roles and caller provider controls at the route boundary", async () => {
    const badRole = await POST(request(JSON.stringify({ messages: [{ ...userMessage, role: "system" }], context })));
    const badProviderConfig = await POST(request(JSON.stringify({ messages: [userMessage], context, model: "caller-model", tools: {} })));
    expect(badRole.status).toBe(400);
    expect(badProviderConfig.status).toBe(400);
  });

  test("returns 503 when the server has no OpenAI key and restores process state", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    try {
      delete process.env.OPENAI_API_KEY;
      const result = await POST(request(JSON.stringify({ messages: [userMessage], context })));
      expect(result.status).toBe(503);
      expect(await result.json()).toMatchObject({ error: expect.stringContaining("not configured") });
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });
});


test("streams a mocked Meridian model through the Mastra AI SDK adapter", async () => {
  const model = new MockLanguageModelV3({
    modelId: "meridian-test-model",
    doStream: (async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "Mock Meridian response." },
          { type: "text-end", id: "text-1" },
          { type: "finish", finishReason: "stop" as const, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 4, text: 4, reasoning: 0 } } },
        ],
      }),
      rawCall: { rawPrompt: null, rawSettings: {} },
      request: { body: undefined },
      response: { headers: {}, id: "mock-response", modelId: "meridian-test-model", timestamp: new Date() },
      warnings: [],
    })) as never,
  });
  const agent = createMeridianAgent(context);
  agent.model = model as never;
  const mastra = new Mastra({ agents: { meridian: agent } });
  const stream = await handleChatStream({
    mastra, agentId: "meridian", version: "v7", sendReasoning: false,
    params: { messages: [userMessage], maxSteps: 6 },
  });
  const response = createUIMessageStreamResponse({ stream });
  const body = await response.text();

  expect(response.status).toBe(200);
  expect(body).toContain("Mock Meridian response.");
  expect(model.doStreamCalls).toHaveLength(1);
});
