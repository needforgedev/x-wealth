"use server";

import {
  HYPOTHESIS_PROMPT_VERSION,
  buildHypothesisInput,
  validateHypothesis,
  type HypothesisView,
} from "@/domain/hypothesis";
import { runInteraction, recordUserActed } from "@/server/ai";
import { NotAuthorisedError, requireUser } from "@/server/identity";

import type { ActionResult } from "./auth";

/**
 * Sharpen an idea into a falsifiable hypothesis. `plan.md` W15-04…07.
 *
 * ## What is conspicuously not imported (W15-06)
 *
 * No market data, no catalogue, no database handle, no strategy reads. The
 * compiler loads the instrument catalogue because rules need real symbols; the
 * workbench loads *nothing*, because a hypothesis is a claim about the world
 * made before looking, and every import removed here is a route by which
 * looking could creep in. `hypothesis.test.ts` scans this file's source to
 * keep it that way.
 *
 * ## No subject, by CHECK
 *
 * `runInteraction` is called without one, and migration `0013` refuses a
 * HYPOTHESIS row anchored to a version or a test — a hypothesis written
 * against a strategy you already backtested is a rationalisation.
 *
 * ## No reuse-before-recall, unlike the critique and post-mortem
 *
 * Those explain a *fixed record*, so two narratives invite choosing the
 * kinder one. A hypothesis is being authored, not explained: the trader may
 * genuinely sharpen the same idea twice and keep neither. Every call is
 * logged either way; what makes one the anchor is the trader acting on it.
 */

export type HypothesisResponse = {
  readonly interactionId: string;
  readonly modelId: string;
  /** False when no provider is configured — the screen says so and stops. */
  readonly live: boolean;
  readonly view: HypothesisView | null;
};

export async function sharpenHypothesis(input: {
  idea: string;
  answers?: Array<{ questionId: string; answer: string }>;
}): Promise<ActionResult<HypothesisResponse>> {
  const idea = input.idea.trim();
  if (idea.length < 10) {
    return { ok: false, error: "Say the idea in a sentence or two." };
  }
  if (idea.length > 4_000) {
    return { ok: false, error: "That is too long to sharpen. Say the expectation, not the memoir." };
  }

  try {
    const { user } = await requireUser();

    const logged = await runInteraction({
      userId: user.id,
      contextType: "HYPOTHESIS",
      promptVersion: HYPOTHESIS_PROMPT_VERSION,
      input: buildHypothesisInput({ idea, answers: input.answers }),
    });

    const live = !logged.modelId.startsWith("stub");
    if (!live) {
      return {
        ok: true,
        data: { interactionId: logged.interactionId, modelId: logged.modelId, live: false, view: null },
      };
    }

    const validated = validateHypothesis(logged.output);
    if (validated.status === "INVALID") {
      return {
        ok: false,
        error:
          "The model's answer did not pass the gate and was not shown. " +
          "The call is on the record; try again.",
      };
    }

    return {
      ok: true,
      data: {
        interactionId: logged.interactionId,
        modelId: logged.modelId,
        live: true,
        view: validated.view,
      },
    };
  } catch (error) {
    if (error instanceof NotAuthorisedError) return { ok: false, error: "Sign in first." };
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The workbench could not be reached.",
    };
  }
}

/**
 * Record that the trader took the sharpened hypothesis somewhere.
 *
 * No `resulting_version_id`: nothing has been authored yet, and when a
 * strategy is eventually saved it is the *compile* interaction that names it.
 * What this marks is the human half of the workbench's evidence — the
 * hypothesis was theirs to adopt, and they adopted it (§8.6).
 */
export async function markHypothesisUsed(input: {
  interactionId: string;
}): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    const marked = await recordUserActed({
      interactionId: input.interactionId,
      userId: user.id,
    });
    return marked
      ? { ok: true, data: undefined }
      : { ok: false, error: "That interaction does not belong to this account." };
  } catch (error) {
    if (error instanceof NotAuthorisedError) return { ok: false, error: "Sign in first." };
    return { ok: false, error: "Could not record the decision." };
  }
}
