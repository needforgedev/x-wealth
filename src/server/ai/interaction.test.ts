import { describe, expect, it } from "vitest";

import {
  AiLogError,
  recordUserActed,
  runInteraction,
  type InteractionLog,
  type NewInteraction,
} from "./interaction";
import { AiProviderError } from "./provider";
import { stubProvider, STUB_MODEL_ID } from "./stub";

/**
 * `plan.md` W15-03. The property under test is an ordering, not a feature:
 * **no caller ever holds model output that is not already recorded.**
 *
 * That is `CLAUDE.md` §3 fact 2 in code — the log is the evidence the human
 * authored the strategy, and Reg 16C is why it has to be evidence. A test that
 * only checked "a row gets written" would pass on an implementation that
 * returns first and logs afterwards, which is the exact failure.
 *
 * So the log here is a fake that can be held open and made to fail. Against a
 * real table neither is reachable, and an unreachable failure path is an
 * untested one.
 */

function fakeLog(
  behaviour: {
    /** Resolves before `record` returns. Omit for an immediate write. */
    readonly gate?: Promise<void>;
    readonly failWith?: string;
    readonly matched?: boolean;
  } = {},
): InteractionLog & { readonly recorded: NewInteraction[]; readonly acted: unknown[] } {
  const recorded: NewInteraction[] = [];
  const acted: unknown[] = [];

  return {
    recorded,
    acted,

    async record(row) {
      if (behaviour.gate) await behaviour.gate;
      if (behaviour.failWith) throw new Error(behaviour.failWith);
      recorded.push(row);
      return { id: "11111111-1111-1111-1111-111111111111", createdAt: new Date(0) };
    },

    async markActed(input) {
      acted.push(input);
      return behaviour.matched ?? true;
    },
  };
}

const CALL = {
  userId: "aaaaaaaa-0000-0000-0000-000000000001",
  contextType: "HYPOTHESIS" as const,
  promptVersion: "hypothesis/2026-08-28",
  input: { idea: "buy strength in liquid large caps, exit on a close below the 20-day" },
};

/** Let every pending microtask and timer callback run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("runInteraction", () => {
  it("does not resolve until the interaction is recorded", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const log = fakeLog({ gate });

    let resolved = false;
    const pending = runInteraction({ ...CALL, provider: stubProvider(), log }).then((value) => {
      resolved = true;
      return value;
    });

    await settle();
    // The model has answered by now — the stub is synchronous. If the output
    // were returned before the write, this is where it would have happened.
    expect(resolved).toBe(false);
    expect(log.recorded).toHaveLength(0);

    release();
    const result = await pending;

    expect(resolved).toBe(true);
    expect(log.recorded).toHaveLength(1);
    expect(result.interactionId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("discards the output when the log fails", async () => {
    const log = fakeLog({ failWith: "connection reset" });

    await expect(runInteraction({ ...CALL, provider: stubProvider(), log })).rejects.toBeInstanceOf(
      AiLogError,
    );
  });

  it("does not leak the output through the error it throws", async () => {
    const secret = { kind: "HYPOTHESIS", hypothesis: "the sentence nobody may see" };
    const log = fakeLog({ failWith: "connection reset" });

    // An error is a value a caller can inspect. If the output rode along on
    // one, "log before show" would hold on the happy path and nowhere else.
    const error = await runInteraction({
      ...CALL,
      provider: stubProvider({ output: secret }),
      log,
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AiLogError);
    expect(JSON.stringify(error)).not.toContain("nobody may see");
    expect((error as Error).message).not.toContain("nobody may see");
  });

  it("records nothing when the model call fails", async () => {
    const log = fakeLog();

    await expect(
      runInteraction({ ...CALL, provider: stubProvider({ failWith: "429" }), log }),
    ).rejects.toBeInstanceOf(AiProviderError);

    // Nothing happened, so there is nothing to be evidence of.
    expect(log.recorded).toHaveLength(0);
  });

  it("records the model that answered, not one the caller named", async () => {
    const log = fakeLog();

    await runInteraction({
      ...CALL,
      provider: stubProvider({ modelId: "some-model-v9" }),
      log,
    });

    expect(log.recorded[0].modelId).toBe("some-model-v9");
    expect(log.recorded[0].modelId).not.toBe(STUB_MODEL_ID);
  });

  it("records exactly what the model was shown", async () => {
    const provider = stubProvider();
    const log = fakeLog();

    await runInteraction({ ...CALL, provider, log });

    expect(provider.calls).toHaveLength(1);
    expect(log.recorded[0].inputSnapshot).toEqual(CALL.input);
    expect(provider.calls[0].input).toEqual(log.recorded[0].inputSnapshot);
    expect(log.recorded[0].promptVersion).toBe(CALL.promptVersion);
  });

  it("carries no subject when none is given", async () => {
    const log = fakeLog();

    await runInteraction({ ...CALL, provider: stubProvider(), log });

    // A HYPOTHESIS may name neither, and the migration's CHECK enforces it.
    // Undefined would be stored as a missing key rather than a null column.
    expect(log.recorded[0].strategyVersionId).toBeNull();
    expect(log.recorded[0].forwardTestId).toBeNull();
  });

  it("passes a subject through when one is given", async () => {
    const log = fakeLog();
    const forwardTestId = "ffffffff-0000-0000-0000-000000000001";

    await runInteraction({
      ...CALL,
      contextType: "POST_MORTEM",
      subject: { forwardTestId },
      provider: stubProvider(),
      log,
    });

    expect(log.recorded[0].forwardTestId).toBe(forwardTestId);
    expect(log.recorded[0].contextType).toBe("POST_MORTEM");
  });
});

describe("recordUserActed", () => {
  it("records the version the user authored afterwards", async () => {
    const log = fakeLog();
    const resultingVersionId = "cccccccc-0000-0000-0000-000000000002";

    const ok = await recordUserActed({
      interactionId: "11111111-1111-1111-1111-111111111111",
      userId: CALL.userId,
      resultingVersionId,
      log,
    });

    expect(ok).toBe(true);
    expect(log.acted[0]).toEqual({
      interactionId: "11111111-1111-1111-1111-111111111111",
      userId: CALL.userId,
      resultingVersionId,
    });
  });

  it("acting without authoring anything is a normal outcome", async () => {
    const log = fakeLog();

    await recordUserActed({
      interactionId: "11111111-1111-1111-1111-111111111111",
      userId: CALL.userId,
      log,
    });

    // Reading a critique and changing nothing is a decision, and the ledger
    // records decisions rather than only the ones that produced work.
    expect(log.acted[0]).toMatchObject({ resultingVersionId: null });
  });

  it("reports a miss rather than pretending", async () => {
    const log = fakeLog({ matched: false });

    const ok = await recordUserActed({
      interactionId: "11111111-1111-1111-1111-111111111111",
      userId: "someone-else",
      log,
    });

    expect(ok).toBe(false);
  });
});

describe("the module's public surface", () => {
  it("offers no way to reach a provider", async () => {
    const barrel = await import("./index");

    /**
     * Types disappear at runtime, so this is the complete set of things
     * application code can actually call.
     *
     * The lock is deliberate. A provider on this list would let a caller run
     * `complete` directly and show output that never reached
     * `ai_interactions` — every guarantee above holds only because there is no
     * such route. If this assertion fails, check that what was added cannot
     * produce model output outside `runInteraction` before updating it.
     */
    expect(Object.keys(barrel).sort()).toEqual([
      "AiLogError",
      "AiProviderError",
      "interactionLog",
      "recordUserActed",
      "runInteraction",
    ]);
  });
});
