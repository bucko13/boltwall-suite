import type { SVGProps } from "react";

/**
 * Hand-authored beaker glyph. Inherits currentColor. ~24px default.
 * No icon-library dependency (per spec).
 */
export function LogoBeaker({
  size = 24,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-testid="beaker-logo"
      {...rest}
    >
      {/* Mouth */}
      <path d="M9 3.25h6" />
      {/* Sides + bottom of the beaker */}
      <path d="M10 3.25v5.2L5.25 17.9a2.3 2.3 0 0 0 2.03 3.35h9.44a2.3 2.3 0 0 0 2.03-3.35L14 8.45V3.25" />
      {/* Liquid line */}
      <path d="M7.6 14.1h8.8" />
      {/* Bubble */}
      <circle cx="11" cy="17" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="18.3" r="0.45" fill="currentColor" stroke="none" />
    </svg>
  );
}
