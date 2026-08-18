type MaskIconProps = {
  /** Path to the exported Figma SVG, used as the mask shape. */
  src: string;
  width: number;
  height: number;
  className?: string;
};

/**
 * Renders an exported SVG as a mask filled with `currentColor`, so a single
 * asset can carry active/inactive colours without shipping one file per state.
 * The glyph geometry is still the real Figma export — only the fill is ours.
 */
export function MaskIcon({ src, width, height, className = "" }: MaskIconProps) {
  return (
    <span
      aria-hidden
      style={{
        width,
        height,
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskSize: "100% 100%",
        WebkitMaskSize: "100% 100%",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
      }}
      className={`inline-block shrink-0 bg-current ${className}`}
    />
  );
}
