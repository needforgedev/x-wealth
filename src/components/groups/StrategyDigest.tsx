import { describeCondition } from "@/domain/strategy";
import type { PublishedStrategy } from "@/server/actions/group";

/**
 * A published strategy, as an investor sees it: what it trades, when it enters
 * and exits, where the stop sits.
 *
 * The head version only. `x-wealth-product.md` §5.8 asks a group to display the
 * strategy's full record — every version, every test, every abandonment — and
 * this does not yet, because there are no tests to show and the iteration
 * ledger is a later screen. Nothing is being hidden to make the record look
 * better: `strategy_versions` still accumulates untouched, so switching the
 * ledger on is a display change and not a migration.
 *
 * There are deliberately no performance figures here. None exist — the
 * forward-test engine is not built — and inventing them is the specific thing
 * this product is a response to.
 */
export function StrategyDigest({
  strategy,
  action,
}: {
  strategy: PublishedStrategy;
  /** Advisor-side control, e.g. a withdraw button. */
  action?: React.ReactNode;
}) {
  const { definition } = strategy;

  return (
    <article className="rounded-[8px] border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{strategy.name}</p>
          <p className="mt-[2px] text-[12px] text-muted">
            {strategy.timeframe}
            {strategy.versionNo === null ? "" : ` · v${strategy.versionNo}`}
          </p>
        </div>
        {action}
      </div>

      {strategy.description && (
        <p className="mt-2 text-[13px] leading-[1.5] text-ink">{strategy.description}</p>
      )}

      {definition ? (
        <dl className="mt-3 flex flex-col gap-2 rounded-[6px] bg-surface-alt p-3">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted">Instruments</dt>
            <dd className="mt-[2px] text-[13px] text-ink">
              {definition.instruments.length > 0 ? definition.instruments.join(", ") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted">Enters when</dt>
            <dd className="mt-[2px] text-[13px] text-ink">{describeCondition(definition.entry)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted">Exits when</dt>
            <dd className="mt-[2px] text-[13px] text-ink">{describeCondition(definition.exit)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted">Stop-loss</dt>
            <dd className="mt-[2px] text-[13px] text-ink">
              {definition.stopLossPercent}% below entry · {definition.positionSizePercent}% of
              capital per position
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-[13px] text-muted">This strategy has no saved version yet.</p>
      )}
    </article>
  );
}
