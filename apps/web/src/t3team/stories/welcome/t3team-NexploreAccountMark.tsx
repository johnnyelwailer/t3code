/* oxlint-disable shadcn/no-raw-colors -- brand mark keeps Nexplore orange, like NexploreAIIcon. */
import type { SVGProps } from "react";

/**
 * Nexplore account / org mark for welcome Account rows.
 * Building + person glyph in brand orange (`#f05a0a`) — deliberately not the
 * lowercase "n" used by `NexploreAI` so Entra sign-in is never confused with
 * the Nexplore AI agent. Shapes stay chunky so they read at ServiceMark size.
 */
export function NexploreAccountMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path
        fill="#f05a0a"
        d="M3.5 20.5V6.75c0-.97.78-1.75 1.75-1.75h8.5c.97 0 1.75.78 1.75 1.75V20.5h-2.1V17.2h-7.8v3.3H3.5Zm4.15-5.55h2.2v-2.2h-2.2v2.2Zm0-3.85h2.2v-2.2h-2.2v2.2Zm3.85 3.85h2.2v-2.2h-2.2v2.2Zm0-3.85h2.2v-2.2h-2.2v2.2Z"
      />
      <circle cx="18.1" cy="12.4" r="1.55" fill="#f05a0a" />
      <path fill="#f05a0a" d="M15.35 20.5c.2-1.85 1.35-2.95 2.75-2.95s2.55 1.1 2.75 2.95H15.35Z" />
    </svg>
  );
}
