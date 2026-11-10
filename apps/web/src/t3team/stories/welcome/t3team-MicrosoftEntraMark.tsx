/* oxlint-disable shadcn/no-raw-colors -- Microsoft brand colours are fixed. */
import type { SVGProps } from "react";

/**
 * Official Microsoft four-square mark for the welcome Account row identity
 * tile — signals that Nexplore account sign-in is Entra. Same ServiceMark
 * placement as every other row; not used on the Sign in button.
 */
export function MicrosoftEntraMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 21 21" aria-hidden focusable="false" {...props}>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
