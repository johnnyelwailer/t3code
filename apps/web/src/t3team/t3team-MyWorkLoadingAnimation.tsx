/**
 * My Work's first-load animation.
 *
 * One component for the whole cold start: the startup gate renders it while it decides whether to
 * open My Work (it used to render `null`, so the window sat blank for up to two seconds), and both
 * digest bodies render it as their first-load state. Same art on both sides of the redirect, so
 * the hand-off has nothing to jump between.
 *
 * It is a LOADING state, not decoration — it exists only while a first result is outstanding, so
 * it may breathe where permanent chrome must not. Everything animated is `motion-safe:` or carries
 * a reduced-motion opt-out in t3team-index-myWorkLoading.css; under `prefers-reduced-motion` it is
 * a static, still-pleasant layout.
 */
import { T3TeamPackBrandImage } from "~/t3team/t3team-PackBrandImage";
import { useT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";
import {
  MyWorkLoadingHeader,
  MyWorkLoadingLanes,
} from "~/t3team/t3team-MyWorkLoadingSkeletons";

/**
 * The pack's mark when a pack supplies one, a neutral duo-orb otherwise. Drawn in the theme's own
 * `--primary`, so it belongs to whatever palette is painted rather than to one brand's hexes.
 */
function MyWorkLoadingMark() {
  const brand = useT3TeamPackAppearance()?.brand;
  const packMark = <T3TeamPackBrandImage brand={brand} kind="mark" className="size-7" />;
  if (brand?.mark || brand?.markDark) return packMark;
  return (
    <svg viewBox="0 0 28 28" className="size-7 text-primary" aria-hidden focusable="false">
      <circle cx="11" cy="14" r="7" fill="currentColor" opacity="0.85" />
      <circle cx="19" cy="14" r="7" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

export function MyWorkLoadingAnimation({
  /** The one line of copy under the mark; the gate and the digest say the same thing. */
  message = "Gathering your work…",
}: {
  message?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="@container/digest relative space-y-8"
    >
      <span className="sr-only">Loading My Work</span>
      {/*
        The glow sits behind the header only, inset horizontally to 0: any horizontal overhang
        feeds the scroll container's overflow and can raise a horizontal scrollbar.
      */}
      <div className="relative">
        <div
          className="t3team-mywork-loading-glow pointer-events-none absolute inset-x-0 -top-10 h-40 motion-reduce:animate-none"
          aria-hidden
        />
        <div className="relative space-y-4">
          <div className="flex items-center gap-2.5">
            <MyWorkLoadingMark />
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
          <MyWorkLoadingHeader />
        </div>
      </div>
      <MyWorkLoadingLanes />
    </div>
  );
}

/**
 * The lanes alone, for a digest that already has a real header but cannot yet say whether its
 * lanes are empty (a cached graph that plans to nothing, with the server still answering).
 */
export function MyWorkLoadingLanesPlaceholder() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading My Work</span>
      <MyWorkLoadingLanes />
    </div>
  );
}
