import { COMPILE_JSON_SCHEMA } from "@/domain/compile";
import { CRITIQUE_JSON_SCHEMA } from "@/domain/critique";
import { POST_MORTEM_JSON_SCHEMA } from "@/domain/post-mortem";

import { openRouterProvider } from "./openrouter";
import type { AiCall, AiProvider } from "./provider";
import { stubProvider } from "./stub";

/**
 * Which provider this deployment talks to — the single seam `AD-11` closes.
 *
 * `runInteraction` calls this when no provider is passed, so ordinary
 * application code never names one, never holds one, and therefore has no way
 * to reach `complete` without the logging around it. That is what makes
 * `plan.md` W15-03's guarantee structural rather than a convention.
 *
 * ## With a key, a model; without one, the stub
 *
 * Resolution is by configuration rather than by build flag, and it falls back
 * rather than throwing, because the alternative is a repository nobody can run
 * the tests in without an API key. `metadata.live` tells any screen which one
 * answered, so stub output can never be mistaken for a model's.
 *
 * **The key is read here and nowhere else.** A second reader would be a second
 * route to a provider, and the whole point of this function is that there is
 * exactly one.
 */
export function resolveProvider(): AiProvider {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return stubProvider();

  return openRouterProvider({
    apiKey,
    model: process.env.OPENROUTER_MODEL,
    schemaFor,
  });
}

/**
 * The output contract per context, and the reason a provider cannot be reached
 * without one.
 *
 * §7.11 requires structured output rather than prose. Making the schema a
 * required lookup rather than an optional parameter means a new context type
 * cannot quietly ship as free text: `openRouterProvider` throws when this
 * returns null, so the failure lands on the developer adding the context, not
 * on the user reading an unparseable answer.
 */
function schemaFor(call: AiCall) {
  switch (call.contextType) {
    case "COMPILE":
      return COMPILE_JSON_SCHEMA;
    case "CRITIQUE":
      return CRITIQUE_JSON_SCHEMA;
    case "POST_MORTEM":
      return POST_MORTEM_JSON_SCHEMA;
    default:
      return null;
  }
}
