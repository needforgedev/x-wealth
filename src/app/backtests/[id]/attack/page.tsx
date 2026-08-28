import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { ATTACKS, type Attack, type Finding, type Severity } from "@/domain/adversarial";
import { hasAcknowledgedRisk, nextPath } from "@/domain/onboarding";
import { currentIdentity } from "@/server/identity";
import { latestReportForRun, listReportsForRun } from "@/server/queries/adversarial";
import { loadRunForUser } from "@/server/queries/backtest";

export const dynamic = "force-dynamic";

/**
 * The attack report. `plan.md` W18-09, `CLAUDE.md` §7.7.
 *
 * ## What this page must never do
 *
 * **No verdict, no score, no pass mark.** §8.7 forbids platform-authored
 * grades, and §7.7 is explicit that the suite's job is to break a strategy
 * rather than bless it. There is no "passed", no traffic light, no count of
 * findings presented as a rating out of six. The severity of a finding says how
 * badly *this result* is undermined by *that test* — it is never summed.
 *
 * **No filtering and no hiding.** Every finding is on the page, most severe
 * first, and there is no control that collapses the uncomfortable ones. Same
 * rule as the iteration ledger (W8-04): a reader who can hide a finding has
 * been handed a way to lie to themselves, which is the one thing this product
 * exists to prevent.
 *
 * **Attacks that found nothing are shown as having run.** An empty report and a
 * suite that failed to execute look identical unless the page says which
 * attacks ran, so it does. §7.13's requirement that silence be legible rather
 * than absent applies here too.
 */
export default async function AttackReportPage({ params }: PageProps<"/backtests/[id]/attack">) {
  const { id } = await params;

  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");
  if (!hasAcknowledgedRisk(identity.user)) redirect(nextPath(identity.user));
  const user = identity.user;

  const run = await loadRunForUser(id, user.id);
  if (!run) notFound();

  const report = await latestReportForRun(id, user.id);
  const history = await listReportsForRun(id, user.id);

  if (!report) {
    return (
      <AppShell>
        <AppBar backHref={`/backtests/${id}`} />
        <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
          <h1 className="mt-[24px] text-[20px] font-semibold text-ink">Attack report</h1>
          <p className="mt-4 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
            This run has not been attacked yet. Start it from the run page.
          </p>
          <Link
            href={`/backtests/${id}`}
            className="mt-4 text-[14px] font-semibold text-brand underline"
          >
            Back to the run
          </Link>
        </div>
      </AppShell>
    );
  }

  const findings = report.findings as Finding[];
  const attacksRun = report.attacksRun as Attack[];
  const skipped = report.attacksSkipped as Array<{ attack: Attack; reason: string }>;

  const quiet = ATTACKS.filter(
    (a) => attacksRun.includes(a) && !findings.some((f) => f.attack === a),
  );

  return (
    <AppShell>
      <AppBar backHref={`/backtests/${id}`} />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">{run.strategyName}</h1>
        <p className="mt-[4px] text-[13px] text-muted">
          Attack report on the backtest of v{run.versionNo} · {report.suiteVersion}
        </p>

        {/*
          The framing sentence. It is doing real work: without it a reader takes
          a short findings list as approval, which is exactly the reading §7.7
          says a suite must not invite.
        */}
        <p className="mt-4 rounded-[6px] border border-line p-4 text-[13px] text-ink">
          These are the reasons the backtest may be lying to you. Nothing here says the strategy is
          sound — the suite has no way to reach that conclusion, and an empty list would mean these
          particular tests found nothing, not that there is nothing to find.
        </p>

        <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
          {findings.length === 0
            ? "No findings"
            : `${findings.length} ${findings.length === 1 ? "finding" : "findings"}`}
        </h2>

        {findings.length === 0 ? (
          <p className="mt-3 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
            Every attack below ran and none of them tripped its threshold. That is a statement about
            these six tests, not a clean bill of health.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {findings.map((finding, i) => (
              <li key={i} className="rounded-[6px] border border-line p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                    {ATTACK_LABELS[finding.attack]}
                  </span>
                  <SeverityTag severity={finding.severity} />
                </div>

                {/* An observation with its numbers in it, never a judgement. */}
                <p className="mt-2 text-[14px] text-ink">{finding.observation}</p>

                <Evidence attack={finding.attack} evidence={finding.evidence} />
              </li>
            ))}
          </ol>
        )}

        {/*
          Which attacks ran and found nothing, and which could not run at all.
          Without this an empty report is indistinguishable from a broken one.
        */}
        <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
          What was tested
        </h2>
        <ul className="mt-3 flex flex-col gap-2 text-[13px]">
          {ATTACKS.map((a) => {
            const skip = skipped.find((s) => s.attack === a);
            const hits = findings.filter((f) => f.attack === a).length;

            return (
              <li key={a} className="flex gap-3 border-b border-divider-soft pb-2">
                <span className="w-[150px] shrink-0 text-ink">{ATTACK_LABELS[a]}</span>
                <span className="text-muted">
                  {skip
                    ? `Could not run — ${skip.reason}`
                    : quiet.includes(a)
                      ? "Ran, nothing tripped"
                      : `${hits} ${hits === 1 ? "finding" : "findings"}`}
                </span>
              </li>
            );
          })}
        </ul>

        <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
          How this report was produced
        </h2>
        <dl className="mt-3 flex flex-col gap-2 text-[13px]">
          <Row label="Suite" value={report.suiteVersion} />
          <Row label="Seed" value={String(report.seed)} />
          <Row label="Written" value={report.createdAt.toISOString().slice(0, 10)} />
        </dl>
        <p className="mt-3 text-[13px] text-muted">
          The suite is deterministic and the random reordering is seeded, so this report is a fixed
          consequence of the run, the suite version and the seed above. Attacking the same run again
          returns this same report — there is no second roll of the dice, and it is on your record
          permanently.
        </p>

        {history.length > 1 && (
          <>
            <h3 className="mt-6 text-[12px] font-semibold uppercase tracking-wide text-muted">
              Earlier reports on this run
            </h3>
            <ul className="mt-2 flex flex-col gap-2 text-[13px] text-muted">
              {history.map((h) => (
                <li key={h.report.id}>
                  {h.report.suiteVersion} · {h.report.createdAt.toISOString().slice(0, 10)} ·{" "}
                  {(h.report.findings as Finding[]).length} findings
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-muted">
              A later suite reaching a different conclusion does not remove the earlier one. That a
              finding was downgraded by a change we made is itself worth knowing.
            </p>
          </>
        )}

        <Link
          href={`/backtests/${id}`}
          className="mt-8 text-[14px] font-semibold text-brand underline"
        >
          Back to the run
        </Link>
      </div>
    </AppShell>
  );
}

const ATTACK_LABELS: Record<Attack, string> = {
  WALK_FORWARD: "Split across time",
  PARAMETER_SENSITIVITY: "Parameter sensitivity",
  REGIME_DEPENDENCE: "Market conditions",
  TRADE_ORDER: "Order of trades",
  COST_SENSITIVITY: "Cost sensitivity",
  SAMPLE_SIZE: "Sample size",
};

/**
 * Severity as a word, not a colour alone.
 *
 * A reader who cannot distinguish the tints — colour-blind, low-contrast
 * screen, printed page — still needs the ranking, and the ranking is the whole
 * point of the ordering. So the label carries the meaning and the colour only
 * reinforces it.
 */
function SeverityTag({ severity }: { severity: Severity }) {
  const tone =
    severity === "HIGH"
      ? "border-danger-ink/40 text-danger-ink"
      : severity === "MEDIUM"
        ? "border-field-line-strong text-ink"
        : "border-line text-muted";

  return (
    <span
      className={`shrink-0 rounded-[3px] border px-2 py-[2px] text-[11px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {severity}
    </span>
  );
}

/**
 * The numbers behind the sentence.
 *
 * Only the few fields a reader would check by hand. The full evidence payload
 * is on the record and is deliberately not dumped here — a wall of JSON reads
 * as rigour and gets skipped, which leaves the finding resting on the sentence
 * alone.
 */
function Evidence({
  attack,
  evidence,
}: {
  attack: Attack;
  evidence: Record<string, unknown>;
}) {
  if (attack === "WALK_FORWARD") {
    const windows = evidence.windows as
      | Array<{ from: string; to: string; netReturnPercent: number; tradeCount: number }>
      | undefined;
    if (!windows) return null;

    return (
      <table className="mt-3 w-full border-collapse text-[12px]">
        <tbody>
          {windows.map((w) => (
            <tr key={w.from} className="border-b border-divider-soft">
              <td className="py-1 pr-3 text-muted">
                {w.from} → {w.to}
              </td>
              <td className="py-1 pr-3 text-right tabular-nums text-muted">{w.tradeCount} trades</td>
              <td
                className={`py-1 text-right tabular-nums font-medium ${
                  w.netReturnPercent >= 0 ? "text-ink" : "text-danger-ink"
                }`}
              >
                {signed(w.netReturnPercent)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (attack === "REGIME_DEPENDENCE") {
    const slices = evidence.slices as
      | Array<{ regime: string; tradeCount: number; netPnlPaise: number }>
      | undefined;
    if (!slices) return null;

    return (
      <table className="mt-3 w-full border-collapse text-[12px]">
        <tbody>
          {slices.map((s) => (
            <tr key={s.regime} className="border-b border-divider-soft">
              <td className="py-1 pr-3 text-muted">{s.regime.replace("/", " · ")}</td>
              <td className="py-1 pr-3 text-right tabular-nums text-muted">
                {s.tradeCount} trades
              </td>
              <td
                className={`py-1 text-right tabular-nums font-medium ${
                  s.netPnlPaise >= 0 ? "text-ink" : "text-danger-ink"
                }`}
              >
                ₹{(s.netPnlPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (attack === "PARAMETER_SENSITIVITY") {
    const variants = evidence.variants as
      | Array<{ value: number; netReturnPercent: number }>
      | undefined;
    const baseValue = evidence.baseValue as number | undefined;
    const baseReturn = evidence.baseNetReturnPercent as number | undefined;
    if (!variants || baseValue === undefined || baseReturn === undefined) return null;

    const all = [{ value: baseValue, netReturnPercent: baseReturn }, ...variants].sort(
      (a, b) => a.value - b.value,
    );

    return (
      <table className="mt-3 w-full border-collapse text-[12px]">
        <tbody>
          {all.map((v) => (
            <tr key={v.value} className="border-b border-divider-soft">
              <td className="py-1 pr-3 text-muted">
                {v.value}
                {v.value === baseValue && <span className="ml-2 text-ink">as authored</span>}
              </td>
              <td
                className={`py-1 text-right tabular-nums font-medium ${
                  v.netReturnPercent >= 0 ? "text-ink" : "text-danger-ink"
                }`}
              >
                {signed(v.netReturnPercent)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (attack === "COST_SENSITIVITY") {
    const steps = evidence.steps as
      | Array<{ slippagePercent: number; netReturnPercent: number }>
      | undefined;
    if (!steps) return null;

    return (
      <table className="mt-3 w-full border-collapse text-[12px]">
        <tbody>
          {steps.map((s) => (
            <tr key={s.slippagePercent} className="border-b border-divider-soft">
              <td className="py-1 pr-3 text-muted">{s.slippagePercent}% slippage</td>
              <td
                className={`py-1 text-right tabular-nums font-medium ${
                  s.netReturnPercent >= 0 ? "text-ink" : "text-danger-ink"
                }`}
              >
                {signed(s.netReturnPercent)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-divider-soft pb-2">
      <dt className="w-[110px] shrink-0 text-muted">{label}</dt>
      <dd className="flex-1 text-ink">{value}</dd>
    </div>
  );
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
