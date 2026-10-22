/**
 * My Work's first-load animation.
 *
 * One component for the whole cold start: the startup gate renders it while it decides whether to
 * open My Work (it used to render `null`, so the window sat blank for up to two seconds), and both
 * digest bodies render it as their first-load state. Same art on both sides of the redirect, so
 * the hand-off has nothing to jump between.
 *
 * It is a LOADING state, not decoration — it exists only while a first result is outstanding, so
 * it may breathe where permanent chrome must not. The mark is a pack-neutral vector animation
 * (t3team-MyWorkLoadingMark.tsx), not the brand logo. Everything animated is `motion-safe:` or carries
 * a reduced-motion opt-out in t3team-index-myWorkLoading.css; under `prefers-reduced-motion` it is
 * a static, still-pleasant layout.
 */
import { MyWorkLoadingHeader, MyWorkLoadingLanes } from "~/t3team/t3team-MyWorkLoadingSkeletons";
import { greetingForHour, MyWorkLoadingMark } from "~/t3team/t3team-MyWorkLoadingMark";
import { T3TeamCompanionSlot } from "~/t3team/packs/t3team-CompanionSlot";

export function MyWorkLoadingAnimation({
  /** The line under the greeting; the gate and the digest say the same thing. */
  message = "Gathering your work…",
}: {
  message?: string;
}) {
  const greeting = greetingForHour(new Date().getHours());
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
          <div className="t3team-mywork-loading-mark flex items-center gap-4">
            <T3TeamCompanionSlot
              placement="myWork.loading"
              mood="loading"
              size="sm"
              fallback={<MyWorkLoadingMark />}
            />
            <div>
              <p className="text-xl font-semibold tracking-tight">{greeting}</p>
              <p className="text-sm text-muted-foreground">{message}</p>
            </div>
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
