"use client";

import { useState, type ReactNode } from "react";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import {
  COMPARATORS,
  COMPARATOR_LABELS,
  INDICATORS,
  describeCondition,
  requiredWarmUpBars,
  validateStrategyDefinition,
  type Comparator,
  type Condition,
  type InstrumentChoice,
  type Operand,
  type StrategyDefinition,
} from "@/domain/strategy";

/**
 * Rule-based authoring: indicator + condition + action.
 *
 * No artboard exists for this screen, so it is assembled from the same
 * primitives and tokens as the rest of the app. The output is a structured
 * definition — never code (`x-wealth-product.md` §6).
 */

/**
 * The field styling, without a width.
 *
 * Width is deliberately absent. It used to be baked in as `w-full`, which meant
 * any caller trying to set its own width was competing with it — and losing,
 * because both are `width` utilities and the winner is decided by stylesheet
 * order rather than by which one is written last. That collapsed the operand
 * dropdown to a bare chevron, so an advisor could not see that the right-hand
 * side of a condition was still set to SMA. They typed 30 into what they took
 * for a value box and got "RSI(14) is below SMA(30)".
 */
const inputBase =
  "h-[44px] rounded-[4px] border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand";

const input = `${inputBase} w-full`;

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <div className="mt-[6px]">{children}</div>
      {hint && <span className="mt-[5px] block text-[12px] text-muted">{hint}</span>}
    </label>
  );
}

const OPERAND_KINDS = [
  { value: "SMA", label: "SMA" },
  { value: "EMA", label: "EMA" },
  { value: "RSI", label: "RSI" },
  { value: "PRICE", label: "Close price" },
  { value: "CONSTANT", label: "A number" },
] as const;

function OperandEditor({
  operand,
  onChange,
  label,
}: {
  operand: Operand;
  onChange: (next: Operand) => void;
  label: string;
}) {
  return (
    <div className="flex gap-2">
      <select
        aria-label={`${label} indicator`}
        value={operand.kind}
        onChange={(e) => {
          const kind = e.target.value as Operand["kind"];
          if (kind === "PRICE") onChange({ kind: "PRICE" });
          else if (kind === "CONSTANT") onChange({ kind: "CONSTANT", value: 30 });
          else onChange({ kind, period: kind === "RSI" ? 14 : 20 });
        }}
        // `min-w-0` so it may shrink below its longest option, `flex-1` so it
        // takes whatever the fixed-width number beside it leaves. Without the
        // first it overflows the row; without the second it collapses.
        className={`${inputBase} min-w-0 flex-1`}
      >
        {OPERAND_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>

      {INDICATORS.includes(operand.kind as (typeof INDICATORS)[number]) && "period" in operand && (
        <label className="flex shrink-0 items-center gap-2">
          {/* Named, because "14" beside a dropdown is not self-explanatory —
              this is the field the SMA(30) confusion was typed into. */}
          <span className="text-[12px] text-muted">over</span>
          <input
            aria-label={`${label} period`}
            type="number"
            min={2}
            max={400}
            value={operand.period}
            onChange={(e) => onChange({ ...operand, period: Number(e.target.value) || 0 })}
            className={`${inputBase} w-[76px]`}
          />
        </label>
      )}

      {operand.kind === "CONSTANT" && (
        <input
          aria-label={`${label} value`}
          type="number"
          value={operand.value}
          onChange={(e) => onChange({ kind: "CONSTANT", value: Number(e.target.value) || 0 })}
          className={`${inputBase} w-[104px] shrink-0`}
        />
      )}
    </div>
  );
}

function ConditionEditor({
  title,
  condition,
  onChange,
}: {
  title: string;
  condition: Condition;
  onChange: (next: Condition) => void;
}) {
  return (
    <fieldset className="rounded-[6px] border border-line p-4">
      <legend className="px-1 text-[13px] font-semibold text-ink">{title}</legend>
      <div className="flex flex-col gap-3">
        <OperandEditor
          label={`${title} left`}
          operand={condition.left}
          onChange={(left) => onChange({ ...condition, left })}
        />
        <select
          aria-label={`${title} comparator`}
          value={condition.comparator}
          onChange={(e) => onChange({ ...condition, comparator: e.target.value as Comparator })}
          className={input}
        >
          {COMPARATORS.map((c) => (
            <option key={c} value={c}>
              {COMPARATOR_LABELS[c]}
            </option>
          ))}
        </select>
        <OperandEditor
          label={`${title} right`}
          operand={condition.right}
          onChange={(right) => onChange({ ...condition, right })}
        />
      </div>
      <p className="mt-3 text-[13px] text-muted">{describeCondition(condition)}</p>
    </fieldset>
  );
}

export type StrategyFormValues = {
  name: string;
  description: string;
  hypothesis: string;
  definition: StrategyDefinition;
};

export function StrategyForm({
  initial,
  submitLabel,
  catalogue,
  showIdentity = true,
  changeNote,
  onChangeNote,
  onSubmit,
}: {
  initial: StrategyFormValues;
  submitLabel: string;
  /**
   * What actually has price history loaded. Fetched by the page, server-side —
   * an advisor cannot pick an instrument the engine could not run.
   */
  catalogue: readonly InstrumentChoice[];
  /** A revision keeps the strategy's name and description. */
  showIdentity?: boolean;
  changeNote?: string;
  onChangeNote?: (value: string) => void;
  onSubmit: (values: StrategyFormValues) => Promise<string | null>;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const def = values.definition;
  const setDef = (patch: Partial<StrategyDefinition>) =>
    setValues((v) => ({ ...v, definition: { ...v.definition, ...patch } }));

  const toggleSymbol = (symbol: string) => {
    setError(null);
    setDef({
      instruments: def.instruments.includes(symbol)
        ? def.instruments.filter((s) => s !== symbol)
        : [...def.instruments, symbol],
    });
  };

  const warmUp = requiredWarmUpBars(def);
  const issues = validateStrategyDefinition(def, catalogue);

  const submit = async () => {
    setError(null);
    if (issues.length > 0) {
      setError(issues[0].message);
      return;
    }
    setPending(true);
    const failure = await onSubmit(values);
    setPending(false);
    if (failure) setError(failure);
  };

  return (
    <div className="flex flex-col gap-6">
      {showIdentity && (
        <>
          <Field label="Strategy name">
            <input
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              placeholder="Momentum crossover"
              className={input}
            />
          </Field>
          <Field label="Description">
            <input
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              placeholder="What it does, in one line"
              className={input}
            />
          </Field>
        </>
      )}

      <Field
        label="Hypothesis"
        hint="What you expect to happen, recorded before any result exists."
      >
        <textarea
          value={values.hypothesis}
          onChange={(e) => setValues((v) => ({ ...v, hypothesis: e.target.value }))}
          rows={3}
          placeholder="A 20/50 crossover captures medium-term momentum in large caps."
          className="w-full rounded-[4px] border border-line bg-surface px-3 py-2 text-[15px] text-ink outline-none focus:border-brand"
        />
      </Field>

      <Field
        label="Instruments"
        hint={
          warmUp > 0
            ? `These rules need ${warmUp} sessions of history before the first signal.`
            : "Only instruments with price history loaded can be backtested."
        }
      >
        {catalogue.length === 0 ? (
          <p className="rounded-[6px] bg-surface-alt p-3 text-[13px] text-muted">
            No price history is loaded yet. Run{" "}
            <code className="text-ink">npm run load-market-data</code> before authoring a strategy.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {catalogue.map((choice) => {
              const selected = def.instruments.includes(choice.symbol);
              const tooShort = warmUp > 0 && choice.barCount <= warmUp;
              // An index has a price and nothing to buy; too little history
              // means the rules can never produce a first signal. Both are
              // shown as the reason rather than as a silent absence.
              const blocked = !choice.tradeable || tooShort;

              return (
                <li key={choice.symbol}>
                  <button
                    type="button"
                    disabled={blocked && !selected}
                    onClick={() => toggleSymbol(choice.symbol)}
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-3 rounded-[6px] border px-3 py-[10px] text-left ${
                      selected ? "border-brand bg-brand/[0.06]" : "border-line"
                    } ${blocked && !selected ? "opacity-45" : ""}`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border text-[11px] font-bold ${
                        selected ? "border-brand bg-brand text-white" : "border-line text-transparent"
                      }`}
                    >
                      ✓
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">
                        {choice.name}
                      </span>
                      <span className="block text-[12px] text-muted">
                        {choice.symbol} · {choice.barCount.toLocaleString("en-IN")} sessions
                        {!choice.tradeable && " · index, nothing to buy"}
                        {choice.tradeable && tooShort && " · not enough history for these rules"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Field>

      <ConditionEditor
        title="Entry — buy when"
        condition={def.entry}
        onChange={(entry) => setDef({ entry })}
      />
      <ConditionEditor
        title="Exit — sell when"
        condition={def.exit}
        onChange={(exit) => setDef({ exit })}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Stop-loss %" hint="Below entry.">
          <input
            type="number"
            step={0.5}
            value={def.stopLossPercent}
            onChange={(e) => setDef({ stopLossPercent: Number(e.target.value) || 0 })}
            className={input}
          />
        </Field>
        <Field label="Position size %" hint="Of capital, per position.">
          <input
            type="number"
            step={5}
            value={def.positionSizePercent}
            onChange={(e) => setDef({ positionSizePercent: Number(e.target.value) || 0 })}
            className={input}
          />
        </Field>
        <Field label="Starting capital (₹)">
          <input
            type="number"
            step={1000}
            value={Math.round(def.initialCapitalPaise / 100)}
            onChange={(e) =>
              setDef({ initialCapitalPaise: Math.round((Number(e.target.value) || 0) * 100) })
            }
            className={input}
          />
        </Field>
      </div>

      {onChangeNote && (
        <Field label="What changed" hint="Recorded on the version and visible to investors.">
          <input
            value={changeNote ?? ""}
            onChange={(e) => onChangeNote(e.target.value)}
            placeholder="Slowed the long leg 50 to 100; v1 churned on noise."
            className={input}
          />
        </Field>
      )}

      {(error || issues.length > 0) && (
        <p role="alert" className="text-[14px] text-danger-ink">
          {error ?? issues[0].message}
        </p>
      )}

      <PrimaryButton disabled={pending} onClick={submit}>
        {pending ? "Saving…" : submitLabel}
      </PrimaryButton>
    </div>
  );
}
