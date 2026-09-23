"use server";

import {
  COMPILE_PROMPT_VERSION,
  buildCompileInput,
  compileDefinition,
  type CompileOutput,
  type CompileResult,
} from "@/domain/compile";
import { runInteraction, recordUserActed } from "@/server/ai";
import { NotAuthorisedError, requireUser } from "@/server/identity";
import { loadCatalogue } from "@/server/market-data/catalogue";

import type { ActionResult } from "./auth";

/**
 * Compile a plain-English idea into a strategy definition. `plan.md` W4-12.
 *
 * ## It proposes; it never saves
 *
 * §8.6 — model output is advisory and never modifies a strategy definition.
 * So this returns a definition and stops. Saving is the user pressing save,
 * which goes through `createStrategy` and its validator exactly as a
 * hand-authored strategy does, and `markCompileActed` then links the two.
 *
 * That link is the point of the whole module. `ai_interactions` holding the
 * input, the output, and *whether the user acted* is the evidence that the
 * human authored the strategy — which is what Reg 16C requires us to be able
 * to show (§3, fact 2). A compiler that saved its own output would destroy the
 * evidence it exists to produce.
 *
 * ## Default capital is supplied, not asked
 *
 * Capital is one of the few things a model would otherwise interrogate the user
 * about on every single idea. It is passed in as a default and stated in
 * `assumptions` if unchanged, which keeps the question count where it belongs:
 * on the things that genuinely cannot be assumed.
 */

const DEFAULT_CAPITAL_PAISE = 10_000_000; // ₹1,00,000

export type CompileResponse = {
  /** Null when the log wrote but the model needed more input — still recorded. */
  readonly interactionId: string;
  readonly modelId: string;
  /** False when no provider is configured, so the screen can say so. */
  readonly live: boolean;
  readonly result: CompileResult;
};

export async function compileStrategy(input: {
  idea: string;
  answers?: Array<{ questionId: string; answer: string }>;
}): Promise<ActionResult<CompileResponse>> {
  const idea = input.idea.trim();
  if (idea.length < 10) {
    return { ok: false, error: "Describe the idea in a sentence or two." };
  }
  if (idea.length > 4_000) {
    return { ok: false, error: "That is too long to compile. Say the rule, not the reasoning." };
  }

  try {
    const { user } = await requireUser();
    const catalogue = await loadCatalogue();

    if (catalogue.length === 0) {
      return {
        ok: false,
        error: "No instruments are loaded, so there is nothing a strategy could trade yet.",
      };
    }

    const logged = await runInteraction({
      userId: user.id,
      contextType: "COMPILE",
      promptVersion: COMPILE_PROMPT_VERSION,
      input: buildCompileInput({
        idea,
        catalogue,
        answers: input.answers,
        defaultCapitalPaise: DEFAULT_CAPITAL_PAISE,
      }),
    });

    // The model answered and the answer is recorded. Everything below reads
    // that record; nothing below can change it.
    const result = compileDefinition(logged.output as CompileOutput, catalogue);

    return {
      ok: true,
      data: {
        interactionId: logged.interactionId,
        modelId: logged.modelId,
        live: !logged.modelId.startsWith("stub"),
        result,
      },
    };
  } catch (error) {
    if (error instanceof NotAuthorisedError) return { ok: false, error: "Sign in first." };
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The compiler could not be reached.",
    };
  }
}

/**
 * Record that the user saved what the compiler proposed.
 *
 * Separate from `createStrategy` on purpose: the version has to exist, and be
 * accepted on its own terms, before anything can claim it resulted from an
 * interaction. `resultingVersionId` points at a row `strategy_versions` already
 * accepted — six mandatory components, CHECK and all — so this names an
 * authored strategy rather than authoring one (§8.6).
 */
export async function markCompileActed(input: {
  interactionId: string;
  resultingVersionId: string;
}): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    const marked = await recordUserActed({
      interactionId: input.interactionId,
      userId: user.id,
      resultingVersionId: input.resultingVersionId,
    });
    return marked
      ? { ok: true, data: undefined }
      : { ok: false, error: "That interaction does not belong to this account." };
  } catch (error) {
    if (error instanceof NotAuthorisedError) return { ok: false, error: "Sign in first." };
    return { ok: false, error: "Could not record the decision." };
  }
}
