import type { AiInteractionContext, AiOutput } from "@/db/schema";

/**
 * Where model output comes from.
 *
 * The same shape as `MarketDataSource` in `src/domain/market-data.ts`, and for
 * the same reason: an interface with a stub implementation lets the discipline
 * around the thing be built and proven before the thing itself exists. There is
 * no provider dependency installed (`AD-11` is open, and it needs an account,
 * a key and billing), and none is needed to build `W15-03` — the part that has
 * to be right is *when the log is written relative to the output being
 * returned*, and that is testable against a stub.
 *
 * ## Structured output, never prose
 *
 * `CLAUDE.md` §7.11 requires the model to emit tool output rather than text.
 * That is not a formatting preference. A paragraph cannot be checked for a
 * verdict; a JSON object with no verdict field can. §8.7 forbids us from
 * characterising performance, and the only way to hold a language model to that
 * is to give it nowhere to put the characterisation.
 *
 * ## What is deliberately not here yet
 *
 * **Tool access.** §7.2 says the hypothesis workbench must not generate ideas
 * from price data — scanning data for patterns is p-hacking at the source — so
 * the workbench model gets no market-data tool. That is a per-context tool
 * allowlist and it belongs with the workbench (`W15-06`), not in the transport.
 *
 * **Retries, streaming, token accounting.** All real, none of them affect
 * whether the log is written before the output is shown.
 */

export type AiProviderMetadata = {
  /** Human-readable, for errors and for `npm run` scripts to print. */
  readonly name: string;
  /**
   * Whether this provider reaches a real model. `false` for the stub, and the
   * reason it is on the metadata rather than inferred: a page that renders
   * stub output must be able to say so, and code that guesses from the model
   * id will guess wrong the day an id changes.
   */
  readonly live: boolean;
};

/** One request. Everything here is recorded verbatim in `input_snapshot`. */
export type AiCall = {
  readonly contextType: AiInteractionContext;
  /**
   * Which prompt produced this. A finding is not reproducible without it, and
   * "the prompt changed" is the first thing to check when output drifts.
   */
  readonly promptVersion: string;
  /**
   * Exactly what the model is shown.
   *
   * **No PII.** Phone, DOB and anything else identifying stays out, the same
   * rule as logs, errors and analytics (`CLAUDE.md` §10). This column is
   * retained for as long as the strategy record is, which is forever.
   */
  readonly input: Readonly<Record<string, unknown>>;
};

export type AiResponse = {
  /**
   * The model that actually answered — reported by the provider, never passed
   * in by the caller.
   *
   * If the caller supplied it, the log would record a claim about which model
   * ran rather than a record of it, and the two would diverge the first time a
   * default changed underneath a hardcoded string.
   */
  readonly modelId: string;
  readonly output: AiOutput;
};

export class AiProviderError extends Error {}

export interface AiProvider {
  readonly metadata: AiProviderMetadata;

  /**
   * Run one call.
   *
   * Throws `AiProviderError` on refusal, malformed output, or transport
   * failure. Never returns a partial or unparsed response — a caller that has
   * to decide whether output is usable will eventually decide wrong.
   */
  complete(call: AiCall): Promise<AiResponse>;
}
