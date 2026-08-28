import type { AiOutput } from "@/db/schema";

import { AiProviderError, type AiCall, type AiProvider, type AiResponse } from "./provider";

/**
 * A provider that answers from a script instead of a model.
 *
 * Two jobs, and the second is the one that matters:
 *
 * 1. It lets `W15-03` be built and tested with no API key, no network and no
 *    billing — `AD-11` is open and this work does not wait on it.
 * 2. **It makes the failure cases reachable.** The property this module exists
 *    to guarantee is that output is never shown without a log, and the only way
 *    to prove that is to make the log fail on demand and check what the caller
 *    got. Against a real provider those paths are unreachable on purpose.
 *
 * `metadata.live` is false, so anything rendering this output can say where it
 * came from. A stub that is indistinguishable from a model is how demo content
 * ends up in front of a user believing it was computed.
 */

export const STUB_MODEL_ID = "stub-0";

export function stubProvider(
  script: {
    /** Returned for every call unless `failWith` is set. */
    readonly output?: AiOutput;
    /** Throw instead of answering, to exercise the provider-failure path. */
    readonly failWith?: string;
    /** Overrides the reported model id, for tests that assert on it. */
    readonly modelId?: string;
  } = {},
): AiProvider & { readonly calls: readonly AiCall[] } {
  const calls: AiCall[] = [];

  return {
    metadata: { name: "stub", live: false },

    get calls() {
      return calls;
    },

    async complete(call: AiCall): Promise<AiResponse> {
      calls.push(call);
      if (script.failWith) throw new AiProviderError(script.failWith);
      return {
        modelId: script.modelId ?? STUB_MODEL_ID,
        output: script.output ?? { kind: call.contextType, stub: true },
      };
    },
  };
}
