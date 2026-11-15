import { expect, test } from "@playwright/test";
import { saveConversation, startConversation } from "../components/workspace/intel-chat-session";

function withLocalStorage(run: (store: Map<string, string>, writes: () => number) => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  let writeCount = 0;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { writeCount++; values.set(key, String(value)); },
    removeItem: (key: string) => values.delete(key),
  } });
  try { run(values, () => writeCount); }
  finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
}

test("chat persistence refuses over-limit snapshots without replacing the saved transcript", () => {
  withLocalStorage((store, writes) => {
    const conversation = startConversation("limit-count-test");
    const durable = store.get("meridian.intel-conversation.v1:limit-count-test");
    conversation.messages = Array.from({ length: 201 }, (_, index) => ({ id: `u-${index}`, role: "user" as const, parts: [{ type: "text" as const, text: "x" }] }));
    expect(saveConversation("limit-count-test", conversation)).toBe(false);
    expect(store.get("meridian.intel-conversation.v1:limit-count-test")).toBe(durable);
    expect(writes()).toBe(1);
  });
});

test("chat persistence refuses oversized or malformed nested tool snapshots", () => {
  withLocalStorage((store, writes) => {
    const conversation = startConversation("limit-size-test");
    const key = "meridian.intel-conversation.v1:limit-size-test";
    const durable = store.get(key);
    conversation.messages = Array.from({ length: 18 }, (_, index) => ({ id: `a-${index}`, role: "assistant" as const, parts: [{
      type: "tool-unknown", state: "output-available", output: { ok: true, result: { payload: "x".repeat(120_000) } },
    }] })) as unknown as typeof conversation.messages;
    expect(saveConversation("limit-size-test", conversation)).toBe(false);
    expect(store.get(key)).toBe(durable);

    conversation.messages = [{ id: "bad-clovis", role: "assistant", parts: [{
      type: "tool-runClovisComparison", state: "output-available", output: { ok: true, result: {
        request: { scenario: {}, economics: {}, risk_rules: {} },
        model: {}, initial_moisture: {}, recommendation: {}, financial_summary: {},
        assumptions: [], scenarios: [{ moisture: null, quality: null, water_risk: null, finances: null }],
      } },
    }] }] as unknown as typeof conversation.messages;
    expect(saveConversation("limit-size-test", conversation)).toBe(false);
    expect(store.get(key)).toBe(durable);
    expect(writes()).toBe(1);
  });
});
