"use client";

import Link from "next/link";
import { useState } from "react";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import type { HypothesisView, WorkbenchQuestion } from "@/domain/hypothesis";
import { markHypothesisUsed, sharpenHypothesis } from "@/server/actions/hypothesis";

/**
 * Say the expectation; get it back falsifiable. `plan.md` W15-08, §7.2.
 *
 * ## The output is a sentence pair, not a strategy
 *
 * What leaves this screen is a statement and its negation — what you expect,
 * and what recorded outcome would prove you wrong — plus the window the test
 * needs. Rules come later, at the compiler. Keeping the two screens apart is
 * what keeps the hypothesis a prediction rather than a description of rules
 * that already exist.
 *
 * ## The challenges are shown before the copy button
 *
 * §7.2 says the workbench challenges the premise. Placing the challenges
 * between the sharpened statement and the act of adopting it is the point of
 * the layout: a trader who copies the hypothesis has at least scrolled past
 * the questions it has to survive.
 */

type Phase =
  | { name: "IDEA" }
  | { name: "WORKING" }
  | { name: "QUESTIONS"; questions: readonly WorkbenchQuestion[] }
  | { name: "RESULT"; view: Extract<HypothesisView, { status: "SHARPENED" }> };

type Turn = { role: "you" | "workbench"; text: string };

export function WorkbenchChat() {
  const [idea, setIdea] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState<Phase>({ name: "IDEA" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [interactionId, setInteractionId] = useState<string | null>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function sharpen(withAnswers: Array<{ questionId: string; answer: string }>) {
    setError(null);
    setPhase({ name: "WORKING" });

    const response = await sharpenHypothesis({ idea, answers: withAnswers });
    if (!response.ok) {
      setError(response.error);
      setPhase({ name: "IDEA" });
      return;
    }

    const { view, interactionId: id, live: isLive } = response.data;
    setInteractionId(id);
    setLive(isLive);

    if (!isLive || !view) {
      setPhase({ name: "IDEA" });
      return;
    }
    if (view.status === "NEEDS_INPUT") {
      setTurns((t) => [
        ...t,
        { role: "workbench", text: "A few things before this can be made falsifiable." },
      ]);
      setPhase({ name: "QUESTIONS", questions: view.questions });
      return;
    }
    setPhase({ name: "RESULT", view });
  }

  const answeredAll =
    phase.name === "QUESTIONS" && phase.questions.every((q) => (answers[q.id] ?? "").trim() !== "");

  return (
    <div className="flex flex-col gap-5">
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

      {live === false && (
        <p className="rounded-[4px] border border-line bg-surface-alt px-3 py-2 text-[12px] text-muted">
          No AI provider is configured, so nothing was sharpened. The request was still logged.
        </p>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {/* ---- 1. the expectation ------------------------------------------ */}
      {phase.name === "IDEA" && (
        <div className="flex flex-col gap-3">
          <TextAreaField
            label="What do you expect to happen?"
            height={132}
            placeholder="Large caps that fall hard on no news tend to bounce within a couple of weeks. I think buying those dips beats waiting for confirmation."
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
          />
          <p className="text-[12px] text-muted">
            Say the expectation and, if you can, the why. The workbench sees no market data — it
            sharpens what you write into something a forward test can prove wrong, and it will ask
            rather than guess.
          </p>
          <PrimaryButton
            disabled={idea.trim().length < 10}
            onClick={() => {
              setTurns([{ role: "you", text: idea.trim() }]);
              void sharpen([]);
            }}
          >
            Sharpen it
          </PrimaryButton>
        </div>
      )}

      {phase.name === "WORKING" && <p className="text-[14px] text-muted">Sharpening…</p>}

      {/* ---- 2. what could not be assumed --------------------------------- */}
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
                      answers[q.id] === option ? "border-brand text-ink" : "border-line-strong text-ink"
                    }`}
                  >
                    {option}
                  </button>
                ))}
                <TextField
                  label={q.options.length > 0 ? "Or answer in your own words" : "Your answer"}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
              </div>
            </div>
          ))}

          <PrimaryButton
            disabled={!answeredAll}
            onClick={() => {
              const collected = phase.questions.map((q) => ({
                questionId: q.id,
                answer: (answers[q.id] ?? "").trim(),
              }));
              setTurns((t) => [
                ...t,
                { role: "you", text: collected.map((a) => a.answer).join(" · ") },
              ]);
              void sharpen(collected);
            }}
          >
            Continue
          </PrimaryButton>
        </div>
      )}

      {/* ---- 3. the falsifiable pair -------------------------------------- */}
      {phase.name === "RESULT" && (
        <div className="flex flex-col gap-4">
          <section className="rounded-[8px] border border-brand p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              The hypothesis
            </h2>
            <p className="mt-2 text-[15px] leading-[1.5] text-ink">
              {phase.view.hypothesis.statement}
            </p>

            <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">
              You are wrong if
            </h3>
            <p className="mt-1 text-[14px] leading-[1.5] text-ink">
              {phase.view.hypothesis.wouldBeWrongIf}
            </p>

            <p className="mt-4 text-[12px] text-muted">
              Needs about {phase.view.hypothesis.horizonSessions} trading sessions to answer —
              that is the window to declare when the forward test starts.
            </p>
          </section>

          <section className="rounded-[8px] border border-line p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Questions this has to survive
            </h2>
            <ul className="mt-2 list-disc pl-5 text-[13px] leading-[1.6] text-ink">
              {phase.view.challenges.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            {phase.view.priorArt.length > 0 && (
              <>
                <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Where this idea comes from
                </h3>
                <ul className="mt-2 list-disc pl-5 text-[13px] leading-[1.6] text-muted">
                  {phase.view.priorArt.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] text-muted">
                  From the model&rsquo;s general knowledge, not from any data of yours — treat it
                  as a pointer for your own reading, not a fact.
                </p>
              </>
            )}
          </section>

          <PrimaryButton
            onClick={async () => {
              const text =
                `${phase.view.hypothesis.statement}\n\n` +
                `Wrong if: ${phase.view.hypothesis.wouldBeWrongIf}`;
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
              } catch {
                setCopied(false);
              }
              if (interactionId) void markHypothesisUsed({ interactionId });
            }}
          >
            {copied ? "Copied" : "Copy the hypothesis"}
          </PrimaryButton>
          <p className="text-[12px] text-muted">
            Next: <Link href="/strategies/new" className="font-semibold text-brand">build the rules</Link>{" "}
            that would act on it, backtest them, and declare this hypothesis when the forward test
            starts. The workbench wrote it with you; adopting it is on the record as your decision.
          </p>
        </div>
      )}
    </div>
  );
}
