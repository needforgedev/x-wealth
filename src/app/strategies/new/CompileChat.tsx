"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import type { CompileResult, IntakeQuestion } from "@/domain/compile";
import {
  describeCondition,
  describeSizing,
  type InstrumentChoice,
  type StrategyDefinitionV2,
} from "@/domain/strategy";
import { compileStrategy, markCompileActed } from "@/server/actions/compile";
import { createStrategy } from "@/server/actions/strategy";

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
  | { name: "REVIEW"; definition: StrategyDefinitionV2; assumptions: readonly string[]; summary: string | null }
  | { name: "REJECTED"; issues: readonly { field: string; message: string }[] };

type Turn = { role: "you" | "compiler"; text: string };

export function CompileChat({ catalogue }: { catalogue: InstrumentChoice[] }) {
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
  const [hypothesis, setHypothesis] = useState("");
  const [saving, setSaving] = useState(false);

  async function compile(withAnswers: Array<{ questionId: string; answer: string }>) {
    setError(null);
    setPhase({ name: "WORKING" });

    const response = await compileStrategy({ idea, answers: withAnswers });
    if (!response.ok) {
      setError(response.error);
      setPhase({ name: "IDEA" });
      return;
    }

    const { result, interactionId: id, live: isLive, modelId: model } = response.data;
    setInteractionId(id);
    setLive(isLive);
    setModelId(model);
    applyResult(result);
  }

  function applyResult(result: CompileResult) {
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
            <TextField
              label="Name"
              placeholder="Reliance RSI reversion"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
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
            disabled={saving || name.trim().length < 3 || hypothesis.trim().length < 10}
            onClick={async () => {
              setSaving(true);
              setError(null);

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

              // The strategy exists on its own terms first; only then is the
              // interaction told what resulted from it (§8.6). A failure here
              // costs the evidence link, not the strategy, so it does not
              // block the user.
              if (interactionId) {
                await markCompileActed({
                  interactionId,
                  resultingVersionId: saved.data.versionId,
                });
              }

              router.push(`/strategies/${saved.data.strategyId}`);
            }}
          >
            {saving ? "Saving…" : "Save strategy"}
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
  const rows: Array<[string, string]> = [
    ["Universe", definition.universe.instruments.join(", ")],
    [
      "Liquidity floor",
      definition.universe.minAvgTurnoverPaise === null
        ? "None"
        : `₹${(definition.universe.minAvgTurnoverPaise / 100).toLocaleString("en-IN")} average turnover`,
    ],
    ["Timeframe", definition.timeframe],
    ["Entry", describeCondition(definition.entry)],
    ["Exit", describeCondition(definition.exit)],
    ["Target", definition.targetPercent === null ? "Exit signal only" : `${definition.targetPercent}% above entry`],
    ["Stop-loss", `${definition.stopLossPercent}% below entry`],
    ["Sizing", describeSizing(definition.sizing)],
    ["Max positions", String(definition.maxConcurrentPositions)],
    ["Max exposure", `${definition.maxExposurePercent}%`],
    ["Capital", `₹${(definition.initialCapitalPaise / 100).toLocaleString("en-IN")}`],
  ];

  return (
    <div className="rounded-[8px] border border-line">
      {rows.map(([label, value], i) => (
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
