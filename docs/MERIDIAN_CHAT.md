# Meridian chat

Meridian uses the AI SDK streaming chat endpoint at `POST /api/chat`. The request contract is in `shared/src/types/chat.ts`, mirrored by `MeridianChatRequest` in `shared/python/schemas.py`; `shared/payloads/meridian-chat-request.json` is the canonical example. Client history is sent in AI SDK UI message form (`id`, `role`, and `parts`) and is restricted to text parts. Tool calls and tool results are produced by the server and are not accepted as submitted history.

The assistant has exactly three server tools: `getFieldConditions`, `getPredictionOptions`, and `runClovisComparison`. Tool results use `{ "ok": true, "result": ... }` or `{ "ok": false, "error": "..." }` so unavailable evidence and tool failures remain explicit. They call existing FastAPI endpoints; model weights and inference stay in Python. GPT explains the returned results. The browser renders prediction cards directly from tool output.

## Local configuration

- `OPENAI_API_KEY` supplies model access.
- `AI_AGENT_MODEL` selects the model; the default is `openai/gpt-6.1-terra`.
- `API_BASE_URL` selects the Field Shift API; the local default is `http://localhost:8000`.

Copy `apps/web/.env.example` to `apps/web/.env.local` and set your key there. Keep the key server-only. The Node.js chat route limits execution to six steps and 90 seconds, propagates Stop/disconnect cancellation, and accepts only text user/assistant history plus field context. Model settings and tool definitions cannot be supplied by the browser. No external message-delivery integration is configured.

From the repository root:

```sh
pnpm install
# Restore missing local pointers to the published, hash-checked Clovis runs.
# Existing conflicting pointers are rejected; no fitting or promotion occurs.
apps/api/.venv/bin/python scripts/prepare_legacy_test_pointers.py
pnpm dev
```

See `README.md` for Python environment setup. Windows uses `apps/api/.venv/Scripts/python.exe`. Alternatively configure `FIELD_SHIFT_MODEL_BUNDLE` for the API as documented in `docs/API_HANDOFF.md`. Open `/intel` on port 3000; FastAPI runs on port 8000. Check `http://localhost:8000/ready` for inference availability.

## Conversation and model limits

Chats are held in memory for the current browser session, separately per field/location and crop. Navigation preserves a conversation; reload closes that session's history. New chat clears the current conversation. Each turn captures the current observation date and saved or working-draft plan. It does not save or edit plans.

Clovis comparison is a local reference simulation. It is not a calibrated farmer prediction and must not be presented as validated farm-specific advice. Existing API payloads remain unchanged. Supported treatments are pea, oat and the specific six-species mix before winter wheat. The agent collects decision, cover planting, termination and wheat planting dates, and asks for daily-average **5 cm volumetric moisture** or permission to use the historical training default. Other locations remain selected-field context; they do not change the model's Clovis site.

Dry, typical and very rainy cases use historical weather with no forecast probabilities. Financial and yield conversions use illustrative assumptions. Root-zone relative wetness and mapped storage capacity are not model-compatible starting-moisture measurements. Quality flags, clipping, seasonal validation limits and provisional rule outputs remain inspectable in result cards.

## Verification and troubleshooting

```sh
pnpm --filter @spaceapps/web exec tsc --noEmit
pnpm --filter @spaceapps/web exec playwright test tests/chat-server.spec.ts tests/intel-request.spec.ts --workers=1
apps/api/.venv/bin/python -m unittest apps.api.tests.test_chat_contract
node .agents/skills/api-contract-sync/scripts/validate-payloads.mjs
pnpm run build
```

- Chat returns 503 when `OPENAI_API_KEY` is missing; restart Next.js after configuring it.
- If Terra fails, verify the configured model is accessible to your OpenAI project. Provider failures display a retryable error rather than fabricated results.
- If the local service is unavailable or busy, check `/ready`, Python dependencies, the model bundle/pointers and `API_BASE_URL`, then retry.
- Invalid dates or unsupported crops need corrected scenario inputs; Meridian never substitutes a crop automatically.
- Saved example data are not accepted as a computed prediction. Automated browser tests use explicit mocked streams; a live OpenAI smoke test requires credentials.
