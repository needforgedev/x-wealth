"use client";

export type PageTab = {
  id: string;
  label: string;
};

type PageTabsProps = {
  label: string;
  tabs: ReadonlyArray<PageTab>;
  value: string;
  onChange: (id: string) => void;
  className?: string;
};

/** Uppercase text tabs with a pale underline on the active item. */
export function PageTabs({ label, tabs, value, onChange, className = "" }: PageTabsProps) {
  return (
    <div role="tablist" aria-label={label} className={`flex gap-[45px] ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`border-b-[3px] pb-[12px] text-[13px] font-semibold uppercase whitespace-nowrap ${
              isActive
                ? "border-tab-underline text-black"
                : "border-transparent text-muted"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
