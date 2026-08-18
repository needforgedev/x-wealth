"use client";

type ToggleProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name — the visible captions sit either side of the switch. */
  label: string;
  className?: string;
};

/**
 * Material-style switch: a 34x14 track with a 20px thumb that slides across.
 * Sits inside a 37px square so the tap target matches the Figma instance box.
 */
export function Toggle({ checked, onCheckedChange, label, className = "" }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={`relative flex size-[37px] shrink-0 items-center justify-center ${className}`}
    >
      <span
        className={`block h-[14px] w-[34px] rounded-full transition-colors ${
          checked ? "bg-brand/50" : "bg-meter-track"
        }`}
      />
      <span
        className={`absolute left-[2px] size-[20px] rounded-full shadow-[0_1px_3px_0_rgb(0_0_0/0.3)] transition-transform ${
          checked ? "translate-x-[15px] bg-brand" : "translate-x-0 bg-white"
        }`}
      />
    </button>
  );
}

type ToggleRowProps = ToggleProps & {
  /** Uppercase field label on the left, e.g. PRIVACY. */
  fieldLabel?: string;
  /** Caption shown to the left of the switch, for the unchecked state. */
  offLabel?: string;
  /** Caption shown to the right of the switch, for the checked state. */
  onLabel?: string;
};

/**
 * A switch laid out as a form row: field label pushed left, then the off
 * caption, the switch, and the on caption. Whichever caption matches the
 * current state is inked; the other stays muted.
 */
export function ToggleRow({
  fieldLabel,
  offLabel,
  onLabel,
  className = "",
  ...toggle
}: ToggleRowProps) {
  return (
    <div className={`flex h-[37px] items-center ${className}`}>
      {fieldLabel && (
        <span className="text-[13px] font-medium uppercase text-muted">{fieldLabel}</span>
      )}

      <div className="ml-auto flex items-center gap-[8px]">
        {offLabel && (
          <span
            className={`text-[15px] ${toggle.checked ? "text-muted" : "text-ink"}`}
          >
            {offLabel}
          </span>
        )}
        <Toggle {...toggle} />
        {onLabel && (
          <span
            className={`text-[15px] ${toggle.checked ? "text-ink" : "text-muted"}`}
          >
            {onLabel}
          </span>
        )}
      </div>
    </div>
  );
}
