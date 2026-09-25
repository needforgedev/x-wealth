import type { AiOutput } from "@/db/schema";

import { AiProviderError, type AiCall, type AiProvider, type AiResponse } from "./provider";

/**
 * OpenRouter, closing `AD-11` for development. `plan.md` W15-01.
 *
 * ## Why OpenRouter rather than a vendor SDK
 *
 * It is OpenAI-compatible over plain HTTP, so this file is one `fetch` and no
 * dependency — nothing is installed, and the seam `AD-11` described stays a
 * single function. It also lets the model be changed by environment variable
 * while the code stays still, which is what makes the free-now, paid-later plan
 * a configuration change rather than a rewrite.
 *
 * ## The model must support structured outputs, and most free ones do not
 *
 * §7.11 requires tool output rather than prose, and the reason is not
 * formatting: a paragraph cannot be checked for a verdict, and a JSON object
 * with no verdict field can. On OpenRouter only six of the twenty-one free
 * models support both `tools` and `structured_outputs`. The default here is
 * `nvidia/nemotron-3-super-120b-a12b:free`, which supports both with a 262k
 * context. Its sibling `nemotron-3-ultra-550b-a55b:free` supports tools but
 * **not** `response_format`, so it would fail every call this provider makes —
 * check `supported_parameters` before changing `OPENROUTER_MODEL`.
 *
 * ## Free tier is a development posture, not a production one
 *
 * Free capacity is paid for with data: prompts may be logged and trained on.
 * `input_snapshot` carries the user's strategy logic, which §8.5 makes the one
 * thing that must stay private. **Before real users, move to the paid variant
 * of the same model** — same id without `:free`, no other change.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

/**
 * How many times a schema-invalid answer is retried.
 *
 * Not defensive padding. A model under a strict schema still returns malformed
 * output often enough that it is a normal case rather than an error — the
 * behaviour is visible in every demo of this pattern, where the first attempt
 * fails and the second succeeds. A provider without retries turns an ordinary
 * hiccup into a failed strategy compile in front of the user.
 */
const MAX_ATTEMPTS = 3;

/**
 * The longest one attempt may hold the line open.
 *
 * Found the hard way on 25 Sep 2026: a critique call sat inside `fetch` for
 * over six minutes with no timeout anywhere under it, which in production is a
 * server action hanging in front of a user for as long as the platform allows.
 * Free-tier capacity queues; a queue is indistinguishable from a hang from
 * this side of the socket, and the difference does not matter to the person
 * waiting. Two minutes is generous for a structured completion — after that,
 * failing into the retry loop beats waiting indefinitely for either answer.
 */
const ATTEMPT_TIMEOUT_MS = 120_000;

export type OpenRouterConfig = {
  readonly apiKey: string;
  readonly model?: string;
  /** Injected by tests. Defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** The JSON Schema the response must satisfy, per context. */
  readonly schemaFor: (call: AiCall) => { name: string; strict: boolean; schema: unknown } | null;
};

type ChatResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

export function openRouterProvider(config: OpenRouterConfig): AiProvider {
  const model = config.model ?? DEFAULT_MODEL;
  const doFetch = config.fetchImpl ?? fetch;

  return {
    metadata: { name: `openrouter:${model}`, live: true },

    async complete(call: AiCall): Promise<AiResponse> {
      const schema = config.schemaFor(call);
      if (!schema) {
        throw new AiProviderError(`No output schema registered for context ${call.contextType}.`);
      }

      const { system, ...rest } = call.input as { system?: string };
      const body = {
        model,
        messages: [
          ...(typeof system === "string" ? [{ role: "system", content: system }] : []),
          { role: "user", content: JSON.stringify(rest) },
        ],
        // Not a stylistic setting. The compile step must be as close to
        // deterministic as the provider allows, or the same idea compiles into
        // two different rule sets and the user cannot tell which one they read.
        temperature: 0,
        response_format: { type: "json_schema", json_schema: schema },
      };

      let lastError = "";
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let response: Response;
        try {
          response = await doFetch(ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
          });
        } catch (cause) {
          // A timed-out attempt re-enters the loop like a 5xx: the queue may
          // clear, and if it does not, the caller gets an error rather than a
          // connection held open indefinitely.
          if (cause instanceof Error && cause.name === "TimeoutError") {
            lastError = `no response within ${ATTEMPT_TIMEOUT_MS / 1000}s`;
            continue;
          }
          throw new AiProviderError(`OpenRouter unreachable: ${String(cause)}`);
        }

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          // 4xx other than rate-limiting will not become true by repeating.
          if (response.status !== 429 && response.status < 500) {
            throw new AiProviderError(`OpenRouter ${response.status}: ${text.slice(0, 300)}`);
          }
          lastError = `${response.status}: ${text.slice(0, 200)}`;
          continue;
        }

        const payload = (await response.json().catch(() => null)) as ChatResponse | null;
        if (!payload || payload.error) {
          lastError = payload?.error?.message ?? "unparseable response envelope";
          continue;
        }

        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== "string" || content.trim() === "") {
          lastError = "empty completion";
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          lastError = "completion was not JSON";
          continue;
        }

        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          lastError = "completion was not a JSON object";
          continue;
        }
        if (typeof (parsed as { kind?: unknown }).kind !== "string") {
          lastError = "completion has no `kind`";
          continue;
        }

        return {
          // From the response, never from the caller. A provider that routes to
          // a different model than requested — which OpenRouter does on
          // fallback — must be recorded as the model that actually answered.
          modelId: payload.model ?? model,
          output: parsed as AiOutput,
        };
      }

      throw new AiProviderError(
        `OpenRouter returned nothing usable after ${MAX_ATTEMPTS} attempts (${lastError}).`,
      );
    },
  };
}
