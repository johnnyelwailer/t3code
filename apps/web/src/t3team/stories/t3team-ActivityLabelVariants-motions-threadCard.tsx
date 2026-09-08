/**
 * GHE-40 activity label — story support: the v2 thread card (variant A
 * status slot, faithful copy of the Sidebar.tsx structure).
 *
 * Split from t3team-ActivityLabelVariants-motions.tsx (LOC ceiling).
 */
import { useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { ProjectFavicon } from "~/components/ProjectFavicon";
import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";

import { EnvironmentId, ProviderDriverKind } from "@t3tools/contracts";

import {
  BRANCH,
  DURATION,
  MorphIcon,
  PROJECT_TITLE,
  ProjectSizer,
  StatusWidth,
  THREAD_TITLE,
  useStatusAvail,
} from "./t3team-ActivityLabelVariants-motions-primitives";
import { SlideCycleLabel } from "./t3team-ActivityLabelVariants-motions-slideLabel";

export function ThreadCard({
  label = "Reading contracts",
  labels,
  slide = false,
  idle = false,
  showDuration = true,
}: {
  label?: string;
  labels?: string[];
  slide?: boolean;
  idle?: boolean;
  showDuration?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { avail, sizerRef } = useStatusAvail(cardRef);
  // FIT GATE: fixed slide window; the label simply slides out and back
  const slideWindow = Math.max(avail, 120);
  const cycles = !idle && !slide && !!labels && labels.length > 1;
  const [idx, setIdx] = useState(0);
  const [spinTick, setSpinTick] = useState(0);
  const lastIdxRef = useRef<number | null>(null);
  useEffect(() => {
    if (!cycles) return;
    const t = window.setInterval(() => {
      setIdx((v) => {
        lastIdxRef.current = v;
        return (v + 1) % labels!.length;
      });
      setSpinTick((v) => v + 1);
    }, 14000);
    return () => window.clearInterval(t);
  }, [cycles, labels]);
  // the sizer must measure what is actually shown — the idle card displays
  // “Waiting”, not its label prop
  const activeLabel = idle ? "Waiting" : cycles ? (labels![idx] ?? label) : label;
  const lastIdx = lastIdxRef.current;
  const previousLabel = cycles && lastIdx !== null ? (labels![lastIdx] ?? undefined) : undefined;

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      className="group/sidebar-row t3team-label-pass-scope relative w-full cursor-pointer overflow-hidden rounded-md bg-sidebar-row-active text-sidebar-foreground outline-none select-none"
    >
      <ProjectSizer refHost={sizerRef} />
      <div className="relative z-10 px-[var(--sidebar-row-content-inset)] py-[var(--sidebar-content-inset)]">
        {/* header strip */}
        <div className="flex h-5 min-w-0 items-center gap-1.5">
          <ProjectFavicon
            environmentId={EnvironmentId.make("env-1")}
            cwd="/tmp/build-40"
            projectName="build-40"
            className="size-4 shrink-0"
          />
          <span className="min-w-0 flex-1 truncate text-secondary-label text-xs font-medium">
            {PROJECT_TITLE}
          </span>
          {/* status slot — dynamic width, no reserved space: icon pinned
              left, timer pinned right, label fills the middle */}
          <span className="ml-auto flex shrink-0 items-center justify-end text-xs">
            <StatusWidth
              id={`${activeLabel}${slide ? "|slide" : ""}`}
              label={activeLabel}
              duration={showDuration ? DURATION : undefined}
              slideW={slide ? slideWindow || undefined : undefined}
            >
              {/* icon glides with the width transition; spins on each update
                  (and, in slide mode, instantly on every label landing) */}
              <span className="shrink-0 text-sky-600 dark:text-sky-400">
                <MorphIcon
                  solid={false}
                  pulse
                  spin={cycles || slide}
                  spinTick={spinTick}
                  instant={slide}
                />
              </span>
              <span className="relative min-w-0 flex-1 font-medium text-sky-600 dark:text-sky-400">
                {idle ? (
                  <span role="status" className="opacity-60">
                    <span className="t3team-label-shimmer">Waiting</span>
                  </span>
                ) : slide ? (
                  /* FIT GATE: static truncated label by default; a while in
                     it slides out to the left and straight back — the
                     timer stays anchored the whole time; the
                     icon spins on every landing */
                  <SlideCycleLabel
                    text={label}
                    slideW={slideWindow}
                    onLand={() => setSpinTick((v) => v + 1)}
                  />
                ) : (
                  /* the label rolls; width glide happens on the container */
                  <span className="t3team-roll-stage relative block">
                    {cycles && previousLabel ? (
                      <span
                        aria-hidden
                        key={`out-${activeLabel}`}
                        className="t3team-status-roll-out absolute inset-x-0 top-0"
                      >
                        <span className="t3team-label-shimmer">{previousLabel}</span>
                      </span>
                    ) : null}
                    <span
                      key={activeLabel}
                      role="status"
                      className={`t3team-label-shimmer ${cycles ? "t3team-status-roll-in" : ""}`}
                    >
                      {activeLabel}
                    </span>
                  </span>
                )}
              </span>
              {showDuration ? (
                /* anchored at the container's right edge — it never shifts
                   when the incoming label's width lands; dimmed with the
                   text while waiting */
                <span
                  aria-hidden
                  className={cn("ml-1 shrink-0", idle ? "opacity-50" : "opacity-70")}
                >
                  {DURATION}
                </span>
              ) : null}
            </StatusWidth>
          </span>
        </div>

        {/* title row */}
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">
            {THREAD_TITLE}
          </span>
        </div>

        {/* meta strip: branch + provider icon */}
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-secondary-label text-xs">
          <span className="min-w-0 flex-1 truncate whitespace-nowrap">{BRANCH}</span>
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
