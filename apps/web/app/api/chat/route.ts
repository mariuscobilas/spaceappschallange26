import { handleChatStream } from "@mastra/ai-sdk";
import { createUIMessageStreamResponse } from "ai";
import { createMeridianMastra } from "@/lib/meridian/agent";
import { chatRequestSchema } from "@/lib/meridian/validation";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 256_000) return Response.json({ error: "Chat request is too large." }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Send a valid chat request." }, { status: 400 });
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") {
    return Response.json({ error: "Send text messages ending in a user question and valid field context." }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json({ error: "Meridian is not configured. Set OPENAI_API_KEY on the web server and retry." }, { status: 503 });
  }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]);
  try {
    const stream = await handleChatStream({
      mastra: createMeridianMastra(parsed.data.context, signal, parsed.data.messages),
      agentId: "meridian", version: "v7",
      sendReasoning: false,
      onError: (error) => {
        if (!signal.aborted) console.error("Meridian stream failed", { error: error instanceof Error ? error.name : "UnknownError" });
        return signal.aborted ? "Meridian was stopped or timed out. Please retry." : "Meridian could not respond. Check the server configuration and retry.";
      },
      params: { messages: parsed.data.messages, maxSteps: 6, abortSignal: signal },
    });
    return createUIMessageStreamResponse({ stream, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!signal.aborted) console.error("Meridian request failed", { error: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: signal.aborted ? "Meridian was stopped or timed out. Please retry." : "Meridian could not respond. Check the server configuration and retry." }, { status: signal.aborted ? 504 : 502 });
  }
}
