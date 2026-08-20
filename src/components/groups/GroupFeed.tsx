import { formatPrice, priceFromString } from "@/domain/money";
import { NOT_FORWARD_TESTED_NOTICE } from "@/domain/signal";
import type { FeedItem } from "@/server/actions/signal";

/**
 * A group's stream: trade calls and market views, newest first.
 *
 * Both carry their stored disclosure verbatim. It is not re-generated for
 * display — the point of freezing it onto the row at publish is that what an
 * investor is shown now is what they were told then (PRD §6).
 */

const STANCE_TONES = {
  BULLISH: "bg-buy/10 text-buy",
  BEARISH: "bg-sell/10 text-sell",
  NEUTRAL: "bg-surface-alt text-muted",
} as const;

const RISK_LABELS = { LOW: "Low risk", MEDIUM: "Medium risk", HIGH: "High risk" } as const;

/** Decimal string from the database, in rupees, for a human. */
function rupees(value: string): string {
  return formatPrice(priceFromString(value));
}

function when(value: Date): string {
  return value.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Leg({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-[2px] text-[14px] font-semibold text-ink">{value}</p>
    </div>
  );
}

function Disclosure({ text }: { text: string }) {
  return (
    <p className="mt-3 border-t border-line pt-3 text-[11px] leading-[1.5] text-muted">{text}</p>
  );
}

function CallCard({ item }: { item: Extract<FeedItem, { kind: "CALL" }> }) {
  const isBuy = item.side === "BUY";

  return (
    <article className="rounded-[8px] border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-[28px] shrink-0 items-center rounded-[4px] px-2 text-[12px] font-semibold ${
            isBuy ? "bg-buy/10 text-buy" : "bg-sell/10 text-sell"
          }`}
        >
          {item.side}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{item.symbol}</p>
          <p className="mt-[2px] truncate text-[12px] text-muted">
            {item.strategyName} · {item.timeframe} · {RISK_LABELS[item.riskProfile]}
          </p>
        </div>
        <p className="shrink-0 text-[11px] text-muted">{when(item.publishedAt)}</p>
      </div>

      {/*
        The evidence line sits above the numbers, not below them. An investor
        who reads only the prices has to have passed this first.
      */}
      {!item.forwardTested && (
        <p className="mt-3 rounded-[4px] bg-danger-ink/[0.06] px-3 py-2 text-[12px] font-medium text-danger-ink">
          {NOT_FORWARD_TESTED_NOTICE}
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Leg label="Entry" value={rupees(item.entryPrice)} />
        <Leg label="Stop-loss" value={rupees(item.stopLoss)} />
        <Leg label="Exit" value={item.exitPrice ? rupees(item.exitPrice) : "—"} />
      </div>

      {item.targets.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.targets.map((target) => (
            <span
              key={target.label}
              className="rounded-[4px] bg-surface-alt px-2 py-1 text-[12px] text-ink"
            >
              {target.label} {rupees(target.price)}
            </span>
          ))}
        </div>
      )}

      <p className="mt-3 text-[12px] text-muted">
        Valid {when(item.validFrom)}
        {item.validUntil ? ` — ${when(item.validUntil)}` : " onwards"}
      </p>

      {item.rationale && <p className="mt-2 text-[13px] leading-[1.5] text-ink">{item.rationale}</p>}

      <Disclosure text={item.disclosureBlock} />
    </article>
  );
}

function ViewCard({ item }: { item: Extract<FeedItem, { kind: "VIEW" }> }) {
  return (
    <article className="rounded-[8px] border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-[28px] shrink-0 items-center rounded-[4px] px-2 text-[12px] font-semibold ${STANCE_TONES[item.stance]}`}
        >
          {item.stance}
        </span>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
          {item.symbol ?? "The market"}
        </p>
        <p className="shrink-0 text-[11px] text-muted">{when(item.publishedAt)}</p>
      </div>

      {item.note && <p className="mt-3 text-[13px] leading-[1.5] text-ink">{item.note}</p>}

      {/*
        A view is a direction, not an instruction. Saying so is the difference
        between commentary and an un-evidenced call dressed as commentary.
      */}
      <p className="mt-3 text-[12px] text-muted">
        A view, not a call — no entry, no stop, nothing to act on directly.
      </p>

      <Disclosure text={item.disclosureBlock} />
    </article>
  );
}

export function GroupFeed({ items }: { items: FeedItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-[8px] border border-dashed border-line p-6 text-center">
        <p className="text-[15px] text-ink">Nothing posted yet.</p>
        <p className="mt-2 text-[13px] text-muted">
          Calls and views from this advisor will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`}>
          {item.kind === "CALL" ? <CallCard item={item} /> : <ViewCard item={item} />}
        </li>
      ))}
    </ul>
  );
}
