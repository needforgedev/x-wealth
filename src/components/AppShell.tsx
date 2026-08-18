import type { ReactNode } from "react";

/**
 * The mobile app column. Figma artboards are 375x812 (iPhone 11 Pro / X), so the
 * column tracks that width, stays fluid below it, and centres itself once the
 * viewport grows past `--container-app`.
 */
export function AppShell({
  children,
  className = "bg-surface",
}: {
  children: ReactNode;
  /** Override to change the screen background, e.g. `bg-brand`. */
  className?: string;
}) {
  return (
    <div
      className={`mx-auto flex min-h-dvh w-full max-w-app flex-col overflow-x-hidden ${className}`}
    >
      {children}
    </div>
  );
}
