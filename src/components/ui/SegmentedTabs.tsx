"use client";

export type SegmentedTab = {
  id: string;
  label: string;
};

type SegmentedTabsProps = {
  label: string;
  tabs: ReadonlyArray<SegmentedTab>;
  value: string;
  onChange: (id: string) => void;
  /**
   * When set, each tab is given the id `${idPrefix}-${tab.id}` and points at a
   * panel with the id `panel-${tab.id}`. Omit when the tabs switch content in
   * place and there is no separately labelled panel.
   */
  idPrefix?: string;
  className?: string;
};

/**
 * Two-up (or n-up) segmented tabs filling the full width: the active tab is
 * white with a 3px brand rule along its top edge, the rest sit on the alt
 * surface. Used for Investor/Advisor on Get Started and Buy/Sell on the
 * Send Signal sheet.
 */
export function SegmentedTabs({
  label,
  tabs,
  value,
  onChange,
  idPrefix,
  className = "",
}: SegmentedTabsProps) {
  return (
    <div role="tablist" aria-label={label} className={`flex ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === value;
        return (
          <button
            key={tab.id}
            id={idPrefix ? `${idPrefix}-${tab.id}` : undefined}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={idPrefix ? `panel-${tab.id}` : undefined}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`h-[52px] flex-1 border-t-[3px] text-[15px] font-medium transition-colors ${
              isActive
                ? "border-brand bg-surface text-ink"
                : "border-transparent bg-surface-alt text-muted"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
