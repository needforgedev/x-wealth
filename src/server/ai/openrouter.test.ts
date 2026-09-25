import { describe, expect, it, vi } from "vitest";

import { AiProviderError, type AiCall } from "./provider";
import { openRouterProvider } from "./openrouter";

const CALL: AiCall = {
  contextType: "COMPILE",
  promptVersion: "compile-1",
  input: { system: "you are a compiler", idea: "buy the dip" },
};

const SCHEMA = { name: "s", strict: true, schema: { type: "object" } };
const schemaFor = () => SCHEMA;

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const good = { model: "nvidia/nemotron-3-super-120b-a12b:free", choices: [{ message: { content: '{"kind":"COMPILE","status":"COMPILED"}' } }] };

describe("the OpenRouter provider", () => {
  it("returns parsed structured output", async () => {
    const fetchImpl = vi.fn(async () => respond(good));
    const provider = openRouterProvider({ apiKey: "k", retryDelayMs: 0, fetchImpl: fetchImpl as never, schemaFor });

    const res = await provider.complete(CALL);
    expect(res.output.kind).toBe("COMPILE");
    expect(provider.metadata.live).toBe(true);
  });

  /**
   * `modelId` comes from the response, never the request. OpenRouter routes to
   * a different provider on fallback, so a log recording what we *asked for*
   * would be a claim about which model ran rather than a record of it.
   */
  it("records the model that actually answered, not the one requested", async () => {
    const fetchImpl = vi.fn(async () => respond({ ...good, model: "some/fallback-model" }));
    const provider = openRouterProvider({
      apiKey: "k", retryDelayMs: 0, model: "nvidia/nemotron-3-super-120b-a12b:free",
      fetchImpl: fetchImpl as never, schemaFor,
    });
    expect((await provider.complete(CALL)).modelId).toBe("some/fallback-model");
  });

  /**
   * The behaviour the Sarathi demo shows twice in a row: a schema-constrained
   * answer that isn't. Under a free model this is ordinary, not exceptional —
   * without a retry it surfaces as a failed compile in front of the user.
   */
  it("retries malformed output and succeeds on a later attempt", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(respond({ choices: [{ message: { content: "Sure! Here is your strategy:" } }] }))
      .mockResolvedValueOnce(respond({ choices: [{ message: { content: "[]" } }] }))
      .mockResolvedValueOnce(respond(good));

    const provider = openRouterProvider({ apiKey: "k", retryDelayMs: 0, fetchImpl: fetchImpl as never, schemaFor });
    expect((await provider.complete(CALL)).output.kind).toBe("COMPILE");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives up rather than returning something unparseable", async () => {
    const fetchImpl = vi.fn(async () => respond({ choices: [{ message: { content: "not json" } }] }));
    const provider = openRouterProvider({ apiKey: "k", retryDelayMs: 0, fetchImpl: fetchImpl as never, schemaFor });
    await expect(provider.complete(CALL)).rejects.toBeInstanceOf(AiProviderError);
  });

  it("does not retry a request that cannot become valid", async () => {
    const fetchImpl = vi.fn(async () => respond({ error: { message: "bad key" } }, 401));
    const provider = openRouterProvider({ apiKey: "k", retryDelayMs: 0, fetchImpl: fetchImpl as never, schemaFor });
    await expect(provider.complete(CALL)).rejects.toBeInstanceOf(AiProviderError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a rate limit, which can become valid", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(respond({ error: { message: "slow down" } }, 429))
      .mockResolvedValueOnce(respond(good));
    const provider = openRouterProvider({ apiKey: "k", retryDelayMs: 0, fetchImpl: fetchImpl as never, schemaFor });
    expect((await provider.complete(CALL)).output.kind).toBe("COMPILE");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  /**
   * §7.11 requires structured output. A context with no registered schema is a
   * context that would silently ship as prose, so it fails at the provider
   * rather than at the reader.
   */
  it("refuses a context with no output schema", async () => {
    const provider = openRouterProvider({ apiKey: "k", retryDelayMs: 0, fetchImpl: vi.fn() as never, schemaFor: () => null });
    await expect(provider.complete(CALL)).rejects.toThrow(/No output schema/);
  });

  it("sends the schema and a zero temperature", async () => {
    const fetchImpl = vi.fn(async () => respond(good));
    const provider = openRouterProvider({ apiKey: "k", retryDelayMs: 0, fetchImpl: fetchImpl as never, schemaFor });
    await provider.complete(CALL);

    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.response_format).toEqual({ type: "json_schema", json_schema: SCHEMA });
    // The same idea must not compile into two different rule sets.
    expect(body.temperature).toBe(0);
    // `system` is lifted out of the snapshot into its own role rather than
    // being serialised into the user turn with the rest of the input.
    expect(body.messages[0]).toEqual({ role: "system", content: "you are a compiler" });
    expect(JSON.parse(body.messages[1].content)).toEqual({ idea: "buy the dip" });
  });
});
