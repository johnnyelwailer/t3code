/* oxlint-disable shadcn/no-raw-colors -- Microsoft brand squares keep their official colours. */
import type { SVGProps } from "react";

/**
 * Microsoft / Entra four-square mark for the Nexplore account (Entra) welcome row.
 * Clean vector squares — not the Nexplore AI "n" and not a pixel-art org glyph.
 */
export function MicrosoftEntraMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" />
      <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00" />
      <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" />
    </svg>
  );
}
