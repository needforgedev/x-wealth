type AvatarProps = {
  initials: string;
  /** Diameter in px — 54 on Complete Profile, smaller in list rows. */
  size?: number;
  className?: string;
};

/** Circular initials badge. Tinted brand at 21%, matching the Figma ellipse fill. */
export function Avatar({ initials, size = 54, className = "" }: AvatarProps) {
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.296) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-avatar/[0.21] font-medium text-avatar-ink ${className}`}
    >
      {initials}
    </span>
  );
}
