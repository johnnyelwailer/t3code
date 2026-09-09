/**
 * GHE-40 activity label — story support: the live state machine card that
 * cycles live → live → Waiting → Done on its own timer.
 *
 * Used by t3team-ActivityLabelVariants.stories.tsx (PlacementVariants).
 * The timer + fit-gate measurement live in
 * t3team-ActivityLabelVariants-stateCycle-logic.ts (LOC ceiling).
 */
import { useRef } from "react";

import { ProjectFavicon } from "~/components/ProjectFavicon";
import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";

import { EnvironmentId, ProviderDriverKind } from "@t3tools/contracts";

import {
  DURATION,
  MorphIcon,
  PROJECT_TITLE,
  SlideCycleLabel,
  StatusWidth,
} from "./t3team-ActivityLabelVariants-motions";
import { DEMO_STATES, useStateCycle } from "./t3team-ActivityLabelVariants-stateCycle-logic";

/** Card that cycles live → live → Waiting → Done on its own timer. */
export function StateCycleCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const sizersRef = useRef<HTMLSpanElement>(null);
  const { i, state, previous, liveToLive, spinState, setSpinState, measure, over } = useStateCycle(
    cardRef,
    sizersRef,
  );

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      className="group/sidebar-row relative w-full cursor-pointer overflow-hidden rounded-md bg-sidebar-row-active text-sidebar-foreground outline-none select-none"
    >
      <div className="relative z-10 px-[var(--sidebar-row-content-inset)] py-[var(--sidebar-content-inset)]">
        <div className="flex h-5 min-w-0 items-center gap-1.5">
          <ProjectFavicon
            environmentId={EnvironmentId.make("env-1")}
            cwd="/tmp/build-40"
            projectName="build-40"
            className="size-4 shrink-0"
          />
          <span
            data-project-title
            className="min-w-0 flex-1 truncate text-secondary-label text-xs font-medium"
          >
            {PROJECT_TITLE}
          </span>
          {/* status slot — dynamic width; the unit glides on every change;
              id carries the over-flag so StatusWidth re-measures when the
              fit gate flips the label into/out of slide mode */}
          <span className="ml-auto flex shrink-0 items-center justify-end text-xs">
            <StatusWidth
              id={state.key + (over ? "|slide" : "")}
              label={state.text}
              duration={state.kind === "live" || state.kind === "idle" ? DURATION : undefined}
              slideW={
                over && state.kind === "live"
                  ? Math.max(measure?.avail ?? 0, 120) || undefined
                  : undefined
              }
            >
              {/* the unit itself never remounts and never rolls: the text
                  rolls inside the middle slot, the icon morphs where it
                  sits and glides with the width transition, and the timer
                  stays anchored at the right edge */}
              <span
                className={`shrink-0 transition-colors duration-300 ${
                  state.kind === "done"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-sky-600 dark:text-sky-400"
                } ${state.kind === "idle" ? "opacity-60" : ""}`}
              >
                <MorphIcon
                  solid={state.kind === "done"}
                  pulse={state.kind !== "done"}
                  spinTick={liveToLive ? spinState.tick : 0}
                  spin={liveToLive}
                  instant={spinState.instant}
                />
              </span>
              <span
                className={`relative min-w-0 flex-1 font-medium transition-colors duration-300 ${
                  state.kind === "done"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-sky-600 dark:text-sky-400"
                } ${state.kind === "idle" ? "opacity-60" : ""}`}
              >
                {over && state.kind === "live" ? (
                  /* FIT GATE: static truncated label by default; a while in
                     it slides out to the left and straight back.
                     live2 stays long enough to show a full cycle; the icon
                     spins on every landing */
                  <SlideCycleLabel
                    text={state.text}
                    slideW={Math.max(measure?.avail ?? 0, 120) || 120}
                    onLand={() => setSpinState((s) => ({ tick: s.tick + 1, instant: true }))}
                  />
                ) : (
                  <span className="t3team-roll-stage relative block">
                    {previous ? (
                      <span
                        aria-hidden
                        key={`out-${state.key}`}
                        className="t3team-status-roll-out absolute inset-x-0 top-0"
                      >
                        <span className={previous.kind !== "done" ? "t3team-label-shimmer" : ""}>
                          {previous.text}
                        </span>
                      </span>
                    ) : null}
                    <span
                      key={state.key}
                      role="status"
                      className={`t3team-label-shimmer ${previous ? "t3team-status-roll-in" : ""}`}
                    >
                      {state.text}
                    </span>
                  </span>
                )}
              </span>
              {state.kind === "live" || state.kind === "idle" ? (
                <span
                  aria-hidden
                  className={`ml-1 shrink-0 ${
                    state.kind === "idle" ? "opacity-50" : "opacity-70"
                  } ${previous?.kind !== "live" ? "t3team-icon-fade-in" : ""}`}
                >
                  {DURATION}
                </span>
              ) : null}
            </StatusWidth>
          </span>
        </div>
        {/* hidden sizers for the fit gate (same font context as the status) */}
        <span
          ref={sizersRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-px overflow-hidden opacity-0"
        >
          <span
            data-sizer="__project"
            className="inline-block whitespace-nowrap text-xs font-medium"
          >
            {PROJECT_TITLE}
          </span>
          {DEMO_STATES.map((s) => (
            <span
              key={s.key}
              data-sizer={s.key}
              className="inline-block whitespace-nowrap text-xs font-medium"
            >
              {s.text}
            </span>
          ))}
        </span>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">
            Refactor settings panel
          </span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-secondary-label text-xs">
          <span className="min-w-0 flex-1 truncate whitespace-nowrap">refactor/settings</span>
          <ProviderInstanceIcon
            driverKind={ProviderDriverKind.make("claudeAgent")}
            displayName="Nexplore"
            className="size-3.5"
            iconClassName="size-3.5"
          />
        </div>
      </div>
    </div>
  );
}
