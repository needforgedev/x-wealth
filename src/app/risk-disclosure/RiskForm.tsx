"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { Checkbox } from "@/components/ui/Checkbox";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { acknowledgeRisk } from "@/server/actions/profile";

/**
 * The last gate before the app.
 *
 * PRD §5.9 makes this mandatory and §6 puts disclosure at the point of
 * decision — contemporaneous, not buried in a footer. Each point is
 * acknowledged separately rather than one blanket "I agree", so the record
 * says what was actually understood.
 */
export function RiskForm() {
  const router = useRouter();
  const [loss, setLoss] = useState(false);
  const [notAdvice, setNotAdvice] = useState(false);
  const [pastPerformance, setPastPerformance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const ready = loss && notAdvice && pastPerformance;

  return (
    <AppShell>
      {/* `/choose-interests` until W24 — the interests step fed a discovery
          feed of other people's strategies and went with it (§8.5). The step
          before this one is now the experience question. */}
      <AppBar backHref="/onboarding-questions" />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[40px] text-center text-[20px] font-semibold text-ink">
          Before you continue
        </h1>
        <p className="mt-[6px] text-center text-[16px] text-muted">
          Read these. They are not boilerplate.
        </p>

        <div className="mt-8 flex flex-col gap-5">
          <Checkbox checked={loss} onCheckedChange={setLoss}>
            <span className="text-ink">Trading carries the risk of loss, including total loss.</span>{" "}
            Money you put at risk on a strategy you built here is money you can lose in full.
          </Checkbox>

          <Checkbox checked={notAdvice} onCheckedChange={setNotAdvice}>
            <span className="text-ink">This is a tool, not advice.</span> X-Wealth never forms a
            view on any security. It compiles the idea you describe into rules, tests those rules,
            and reports what happened. It does not produce research, does not recommend, never
            places an order and never holds your money. The strategy is yours, and so is every
            decision that follows from it.
          </Checkbox>

          <Checkbox checked={pastPerformance} onCheckedChange={setPastPerformance}>
            <span className="text-ink">Past performance does not predict future results.</span>{" "}
            Forward-tested figures are produced on simulated capital, net of costs. They describe
            what happened in a test window, not what will happen to you.
          </Checkbox>
        </div>

        <p className="mt-6 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
          Your strategies are private to you. Nothing you build here is shown to another user, and
          nothing another user builds is shown to you — there are no shared strategies on this
          platform and no rankings of any kind. X-Wealth reports what your rules did and never
          grades them.
        </p>

        {error && (
          <p role="alert" className="mt-4 text-center text-[14px] text-danger-ink">
            {error}
          </p>
        )}

        <PrimaryButton
          className="mt-6"
          disabled={pending || !ready}
          onClick={async () => {
            setError(null);
            setPending(true);
            const result = await acknowledgeRisk({
              understandsLoss: loss,
              understandsNotAdvice: notAdvice,
              understandsPastPerformance: pastPerformance,
            });
            setPending(false);
            if (!result.ok) return setError(result.error);
            // `/investor/home` until W24. There is one persona now, and the
            // trader's landing page is their strategy list — this is the last
            // step of onboarding, so the dead route sent every new account to a
            // 404 the moment they finished signing up.
            router.push("/home");
            router.refresh();
          }}
        >
          {pending ? "Recording…" : "I understand — continue"}
        </PrimaryButton>

        {!ready && (
          <p className="mt-2 text-center text-[13px] text-muted">
            All three have to be acknowledged.
          </p>
        )}
      </div>
    </AppShell>
  );
}
