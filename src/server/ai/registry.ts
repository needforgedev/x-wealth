import type { AiProvider } from "./provider";
import { stubProvider } from "./stub";

/**
 * Which provider this deployment talks to — the single seam `AD-11` closes.
 *
 * `runInteraction` calls this when no provider is passed, so ordinary
 * application code never names one, never holds one, and therefore has no way
 * to reach `complete` without the logging around it. That is what makes
 * `plan.md` W15-03's guarantee structural rather than a convention.
 *
 * ## Today it returns the stub, and that is not a placeholder oversight
 *
 * `AD-11` is open. No provider dependency is installed, there is no API key,
 * and there is no billing account — the decision needs all three and none of
 * them is an engineering task. `metadata.live` is false on what comes back, so
 * any screen rendering this output can say plainly that no model was involved.
 *
 * When `AD-11` closes, this function is the only thing that changes. Every
 * caller, the log, the tests and the invariants stay exactly as they are.
 */
export function resolveProvider(): AiProvider {
  return stubProvider();
}
