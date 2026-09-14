import { useEffect, useRef } from "react";

import { cn } from "~/lib/utils";

/**
 * The status icon as ONE persistent SVG so its shape can MORPH instead of
 * swapping or rolling:
 *   - ring: dashes (running) ↔ solid (done) — the dasharray animates, so
 *     the dashes stretch and merge into a full circle (and back)
 *   - check: stroke-dashoffset draw-on / draw-off, slightly after the ring
 *     settles
 * Idle life: a slow fade pulse. The one-shot springy spin on activity
 * change runs through the Web Animations API (no remount, so the morph
 * survives).
 */
export function ThreadActivityMorphIcon({
  solid,
  pulse = false,
  spinTick = 0,
  spin = false,
  instant = false,
  size = "md",
}: {
  solid: boolean;
  pulse?: boolean;
  spinTick?: number;
  spin?: boolean;
  /** true = spin now (label just landed); false = wait for the move to finish */
  instant?: boolean;
  /** "md" (size-4) matches the card's icon; "sm" (size-3) for the denser
   *  sub-run rows, which render the SAME ring so child and parent read as
   *  one status language. */
  size?: "md" | "sm";
}) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (!spin || spinTick === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ref.current?.animate(
      [
        { transform: "rotate(0deg)" },
        { transform: "rotate(378deg)", offset: 0.7 },
        { transform: "rotate(360deg)" },
      ],
      {
        duration: 600,
        delay: instant ? 0 : 1150, // delayed: after width glide (0.82s) + roll-in (1.10s)
        easing: "cubic-bezier(0.34, 1.4, 0.44, 1)",
      },
    );
  }, [spinTick, spin, instant]);
  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn(size === "sm" ? "size-3" : "size-4", "shrink-0", pulse && "t3team-icon-pulse")}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        style={{
          strokeDasharray: solid ? "62.83 0.01" : "7 3.44",
          transition: "stroke-dasharray 0.5s ease",
        }}
      />
      <path
        d="M8.4 12.6l2.6 2.6 4.9-5.4"
        style={{
          strokeDasharray: 11.5,
          strokeDashoffset: solid ? 0 : 11.5,
          transition: "stroke-dashoffset 0.35s ease 0.15s",
        }}
      />
    </svg>
  );
}
