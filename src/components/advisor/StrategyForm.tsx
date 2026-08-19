"use client";

import { useState, type ReactNode } from "react";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { isSymbol } from "@/domain/symbol";
import {
  COMPARATORS,
  COMPARATOR_LABELS,
  INDICATORS,
  describeCondition,
  validateStrategyDefinition,
  type Comparator,
  type Condition,
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

const input =
  "h-[44px] w-full rounded-[4px] border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand";

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
        className={`${input} flex-1`}
      >
        {OPERAND_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>

      {INDICATORS.includes(operand.kind as (typeof INDICATORS)[number]) && "period" in operand && (
        <input
          aria-label={`${label} period`}
          type="number"
          min={2}
          max={400}
          value={operand.period}
          onChange={(e) => onChange({ ...operand, period: Number(e.target.value) || 0 })}
          className={`${input} w-[92px]`}
        />
      )}

      {operand.kind === "CONSTANT" && (
        <input
          aria-label={`${label} value`}
          type="number"
          value={operand.value}
          onChange={(e) => onChange({ kind: "CONSTANT", value: Number(e.target.value) || 0 })}
          className={`${input} w-[92px]`}
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
  showIdentity = true,
  changeNote,
  onChangeNote,
  onSubmit,
}: {
  initial: StrategyFormValues;
  submitLabel: string;
  /** A revision keeps the strategy's name and description. */
  showIdentity?: boolean;
  changeNote?: string;
  onChangeNote?: (value: string) => void;
  onSubmit: (values: StrategyFormValues) => Promise<string | null>;
}) {
  const [values, setValues] = useState(initial);
  const [symbolDraft, setSymbolDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const def = values.definition;
  const setDef = (patch: Partial<StrategyDefinition>) =>
    setValues((v) => ({ ...v, definition: { ...v.definition, ...patch } }));

  const addSymbol = () => {
    const symbol = symbolDraft.trim().toUpperCase();
    if (!symbol) return;
    if (!isSymbol(symbol)) {
      setError(`"${symbol}" needs an exchange prefix — e.g. NSE:RELIANCE.`);
      return;
    }
    if (def.instruments.includes(symbol)) {
      setError("That instrument is already on the list.");
      return;
    }
    setError(null);
    setDef({ instruments: [...def.instruments, symbol] });
    setSymbolDraft("");
  };

  const issues = validateStrategyDefinition(def);

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
        hint="Exchange-qualified, e.g. NSE:RELIANCE. There is no instrument master yet — that arrives with the data layer."
      >
        <div className="flex gap-2">
          <input
            value={symbolDraft}
            onChange={(e) => setSymbolDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSymbol();
              }
            }}
            placeholder="NSE:RELIANCE"
            className={input}
          />
          <button
            type="button"
            onClick={addSymbol}
            className="h-[44px] shrink-0 rounded-[4px] border border-line px-4 text-[14px] font-semibold text-ink"
          >
            Add
          </button>
        </div>

        {def.instruments.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {def.instruments.map((symbol) => (
              <li key={symbol}>
                <button
                  type="button"
                  onClick={() =>
                    setDef({ instruments: def.instruments.filter((s) => s !== symbol) })
                  }
                  className="flex h-[32px] items-center gap-2 rounded-[4px] border border-brand bg-brand/[0.08] px-3 text-[13px] font-medium text-brand"
                >
                  {symbol}
                  <span aria-hidden>×</span>
                  <span className="sr-only">Remove</span>
                </button>
              </li>
            ))}
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
