"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import {
  definitionRows,
  type CompileResult,
  type FieldChange,
  type IntakeQuestion,
} from "@/domain/compile";
import { type InstrumentChoice, type StrategyDefinitionV2 } from "@/domain/strategy";
import { compileStrategy, markCompileActed } from "@/server/actions/compile";
import { createStrategy, reviseStrategy } from "@/server/actions/strategy";

/**
 * Describe an idea; get a rule set back. `plan.md` W4-12, `CLAUDE.md` §7.3.
 *
 * ## Four screens, and the third is the one that matters
 *
 * idea → questions → **review** → hypothesis. The review step is not a
 * confirmation dialog: §8.6 makes model output advisory, so the user has to see
 * every compiled rule in plain language and press save themselves. A flow that
 * compiled straight into the database would make the model the author, which is
 * precisely what `ai_interactions` exists to prove did not happen.
 *
 * ## Assumptions are shown, never folded away
 *
 * Anything the compiler settled without asking is listed above the rules, in
 * the model's own words. The failure mode this prevents is the quiet one: a
 * strategy that looks fully authored because the parts nobody chose are
 * indistinguishable from the parts they did.
 *
 * ## No score anywhere
 *
 * §8.7. The screen reports what the rules are. It never says whether they are
 * any good, and there is no field on `CompileResult` that could carry such a
 * claim even if this file asked for one.
 */

type Phase =
  | { name: "IDEA" }
  | { name: "WORKING" }
  | { name: "QUESTIONS"; questions: readonly IntakeQuestion[] }
  | {
      name: "REVIEW";
      definition: StrategyDefinitionV2;
      assumptions: readonly string[];
      summary: string | null;
      changes: FieldChange[] | null;
    }
  | { name: "REJECTED"; issues: readonly { field: string; message: string }[] };

type Turn = { role: "you" | "compiler"; text: string };

/**
 * Revising an existing version rather than authoring a new one.
 *
 * The difference that matters is not the action called at the end — it is that
 * the user is owed a **diff**. A revision renders as a complete rule set, so
 * reading it tells you what the rules now are and nothing about what moved; a
 * model asked to widen a stop can re-round the sizing on the way past and the
 * screen would look entirely correct. `strategy_versions` is append-only, so
 * that version is permanent and its lineage misleading.
 */
export type ReviseTarget = {
  strategyId: string;
  versionNo: number;
  onSaved: () => void;
};

export function CompileChat({
  catalogue,
  revise,
}: {
  catalogue: InstrumentChoice[];
  revise?: ReviseTarget;
}) {
  const router = useRouter();

  const [idea, setIdea] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState<Phase>({ name: "IDEA" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [interactionId, setInteractionId] = useState<string | null>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [saving, setSaving] = useState(false);

  async function compile(withAnswers: Array<{ questionId: string; answer: string }>) {
    setError(null);
    setPhase({ name: "WORKING" });

    const response = await compileStrategy({
      idea,
      answers: withAnswers,
      strategyId: revise?.strategyId,
    });
    if (!response.ok) {
      setError(response.error);
      setPhase({ name: "IDEA" });
      return;
    }

    const { result, interactionId: id, live: isLive, modelId: model, changes } = response.data;
    setInteractionId(id);
    setLive(isLive);
    setModelId(model);
    applyResult(result, changes);
  }

  function applyResult(result: CompileResult, changes: FieldChange[] | null) {
    if (result.status === "NEEDS_INPUT") {
      setTurns((t) => [
        ...t,
        { role: "compiler", text: "I need a few things before I can compile this." },
      ]);
      setPhase({ name: "QUESTIONS", questions: result.questions });
      return;
    }
    if (result.status === "COMPILED") {
      setTurns((t) => [...t, { role: "compiler", text: result.summary ?? "Compiled." }]);
      setPhase({
        name: "REVIEW",
        definition: result.definition,
        assumptions: result.assumptions,
        summary: result.summary,
        changes,
      });
      return;
    }
    setPhase({ name: "REJECTED", issues: result.issues });
  }

  const answeredAll =
    phase.name === "QUESTIONS" && phase.questions.every((q) => (answers[q.id] ?? "").trim() !== "");

  return (
    <div className="flex flex-col gap-5">
      {/* ---- the conversation so far ------------------------------------ */}
      {turns.length > 0 && (
        <div className="flex flex-col gap-3">
          {turns.map((turn, i) => (
            <div
              key={i}
              className={
                turn.role === "you"
                  ? "self-end max-w-[85%] rounded-[8px] bg-surface-alt px-4 py-3 text-[14px] text-ink"
                  : "max-w-[92%] text-[14px] leading-[1.55] text-ink"
              }
            >
              {turn.text}
            </div>
          ))}
        </div>
      )}

      {/* ---- where the answer came from --------------------------------- */}
      {live === false && (
        <p className="rounded-[4px] border border-line bg-surface-alt px-3 py-2 text-[12px] text-muted">
          No AI provider is configured, so this came from a stub rather than a model. Nothing
          here was compiled by anything that read your idea.
        </p>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {/* ---- 1. the idea ------------------------------------------------- */}
      {phase.name === "IDEA" && (
        <div className="flex flex-col gap-3">
          <TextAreaField
            label="Describe the idea"
            height={132}
            placeholder="Buy Reliance when the 14-day RSI drops below 30, exit when it goes back above 60. 5% stop, risk 1% per trade."
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
          />
          <p className="text-[12px] text-muted">
            Say the rule, not the reasoning. The compiler translates what you write — it never
            picks instruments for you, and it will ask rather than guess a stop-loss.
          </p>
          <PrimaryButton
            disabled={idea.trim().length < 10}
            onClick={() => {
              setTurns([{ role: "you", text: idea.trim() }]);
              void compile([]);
            }}
          >
            Compile
          </PrimaryButton>
        </div>
      )}

      {phase.name === "WORKING" && (
        <p className="text-[14px] text-muted">Compiling…</p>
      )}

      {/* ---- 2. what it could not assume --------------------------------- */}
      {phase.name === "QUESTIONS" && (
        <div className="flex flex-col gap-4">
          {phase.questions.map((q) => (
            <div key={q.id} className="rounded-[8px] border border-line px-4 py-4">
              <p className="text-[14px] font-semibold text-ink">{q.question}</p>
              <p className="mt-[2px] text-[12px] text-muted">{q.because}</p>

              <div className="mt-3 flex flex-col gap-2">
                {q.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: option }))}
                    className={`rounded-[4px] border px-3 py-3 text-left text-[14px] transition-colors ${
                      answers[q.id] === option
                        ? "border-brand text-ink"
                        : "border-line-strong text-ink"
                    }`}
                  >
                    {option}
                  </button>
                ))}
                <TextField
                  label={q.options.length > 0 ? "Or answer in your own words" : "Your answer"}
                  value={
                    q.options.includes(answers[q.id] ?? "") ? "" : (answers[q.id] ?? "")
                  }
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
              </div>
            </div>
          ))}

          <PrimaryButton
            disabled={!answeredAll}
            onClick={() => {
              const given = Object.entries(answers).map(([questionId, answer]) => ({
                questionId,
                answer,
              }));
              setTurns((t) => [
                ...t,
                { role: "you", text: given.map((g) => g.answer).join(" · ") },
              ]);
              void compile(given);
            }}
          >
            Continue
          </PrimaryButton>
          <p className="text-[12px] text-muted">
            Every question here is one of the six components a strategy cannot be saved
            without. There is no skip.
          </p>
        </div>
      )}

      {/* ---- 3. review, then name it ------------------------------------- */}
      {phase.name === "REVIEW" && (
        <div className="flex flex-col gap-5">
          {phase.changes !== null && <ChangeList changes={phase.changes} />}

          {phase.assumptions.length > 0 && (
            <div className="rounded-[8px] border border-line bg-surface-alt px-4 py-3">
              <p className="text-[13px] font-semibold text-ink">Settled without asking you</p>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[13px] text-ink">
                {phase.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] text-muted">
                Change anything here before saving — once a forward test starts, the
                parameters freeze.
              </p>
            </div>
          )}

          <RuleTable definition={phase.definition} />

          <div className="flex flex-col gap-3">
            {!revise && (
              <TextField
                label="Name"
                placeholder="Reliance RSI reversion"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            {revise && (
              <TextField
                label="What changed, and why"
                placeholder="Widened the stop after three exits inside noise."
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
              />
            )}
            <TextAreaField
              label="The hypothesis you are testing"
              height={96}
              placeholder="Oversold readings on a liquid large-cap revert within fifteen sessions."
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
            />
            <p className="text-[12px] text-muted">
              Written before any result exists. The post-mortem is measured against this
              sentence, so a vague one buys a vague answer.
            </p>
          </div>

          <PrimaryButton
            disabled={
              saving ||
              hypothesis.trim().length < 10 ||
              (revise ? phase.changes?.length === 0 : name.trim().length < 3)
            }
            onClick={async () => {
              setSaving(true);
              setError(null);

              // Both paths land on a version accepted on its own terms — six
              // mandatory components, validator, CHECK — so the compiler is a
              // route to them and never around them (§8.6). The version exists
              // before the interaction is told what resulted from it; a failure
              // on that second step costs the evidence link, not the version.
              const link = async (versionId: string) => {
                if (interactionId) {
                  await markCompileActed({ interactionId, resultingVersionId: versionId });
                }
              };

              if (revise) {
                const saved = await reviseStrategy({
                  strategyId: revise.strategyId,
                  hypothesis: hypothesis.trim(),
                  changeNote: changeNote.trim(),
                  definition: phase.definition,
                });
                if (!saved.ok) {
                  setError(saved.error);
                  setSaving(false);
                  return;
                }
                await link(saved.data.versionId);
                revise.onSaved();
                router.refresh();
                return;
              }

              const saved = await createStrategy({
                name: name.trim(),
                description: phase.summary ?? "",
                hypothesis: hypothesis.trim(),
                definition: phase.definition,
              });
              if (!saved.ok) {
                setError(saved.error);
                setSaving(false);
                return;
              }
              await link(saved.data.versionId);
              router.push(`/strategies/${saved.data.strategyId}`);
            }}
          >
            {saving ? "Saving…" : revise ? `Save version ${revise.versionNo + 1}` : "Save strategy"}
          </PrimaryButton>

          <button
            type="button"
            className="text-[13px] text-muted underline"
            onClick={() => {
              setPhase({ name: "IDEA" });
              setAnswers({});
            }}
          >
            Start again
          </button>
        </div>
      )}

      {/* ---- the compiler produced something unsavable -------------------- */}
      {phase.name === "REJECTED" && (
        <div className="flex flex-col gap-3">
          <p className="text-[14px] text-ink">
            The compiler returned a rule set that would not pass validation, so nothing was
            saved. This is the check working, not a lost strategy — say the idea again, more
            specifically.
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-[13px] text-muted">
            {phase.issues.map((issue, i) => (
              <li key={i}>
                <span className="text-ink">{issue.field}</span> — {issue.message}
              </li>
            ))}
          </ul>
          <PrimaryButton onClick={() => setPhase({ name: "IDEA" })}>Try again</PrimaryButton>
        </div>
      )}

      {modelId && (
        <p className="text-[11px] text-muted">
          Compiled by {modelId}. Every request and response is recorded against your account.
        </p>
      )}

      <p className="text-[12px] text-muted">
        {catalogue.filter((c) => c.tradeable).length} instruments are loaded and tradeable. The
        compiler can only use these.
      </p>
    </div>
  );
}

/**
 * The compiled rules, in the same words the strategy page uses.
 *
 * Deliberately the whole definition rather than a highlight: the six mandatory
 * components are what the user is being asked to accept authorship of, so
 * showing four of them and hiding the rest behind "advanced" would be asking
 * them to sign something they had not read.
 */
function RuleTable({ definition }: { definition: StrategyDefinitionV2 }) {
  return (
    <div className="rounded-[8px] border border-line">
      {definitionRows(definition).map(([label, value], i) => (
        <div
          key={label}
          className={`flex gap-4 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
        >
          <span className="w-[110px] shrink-0 text-[13px] text-muted">{label}</span>
          <span className="text-[13px] text-ink">{value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * What this revision moved, and nothing else.
 *
 * Placed above the full rule set rather than below it: a reader who has already
 * absorbed the new rules has stopped looking for what changed. An empty diff is
 * stated rather than hidden — "nothing changed" is a refusal `reviseStrategy`
 * is about to make anyway, and saying so here explains it before it happens.
 */
function ChangeList({ changes }: { changes: FieldChange[] }) {
  if (changes.length === 0) {
    return (
      <p className="rounded-[8px] border border-line bg-surface-alt px-4 py-3 text-[13px] text-ink">
        Nothing changed. A version identical to the one before it cannot be saved — it would
        pad the ledger without recording a decision.
      </p>
    );
  }

  return (
    <div className="rounded-[8px] border border-brand">
      <p className="border-b border-line px-4 py-3 text-[13px] font-semibold text-ink">
        {changes.length === 1 ? "One field changed" : `${changes.length} fields changed`}
      </p>
      {changes.map((change) => (
        <div key={change.field} className="border-b border-line px-4 py-3 last:border-b-0">
          <p className="text-[13px] font-medium text-ink">{change.field}</p>
          <p className="mt-[2px] text-[13px] text-muted line-through">{change.from}</p>
          <p className="text-[13px] text-ink">{change.to}</p>
        </div>
      ))}
    </div>
  );
}
