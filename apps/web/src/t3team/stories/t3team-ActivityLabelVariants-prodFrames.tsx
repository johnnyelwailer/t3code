/**
 * GHE-40 activity label — story support: production card-row frames + the
 * live / kind / fit-gate demos for the production component story.
 *
 * Split from t3team-ActivityLabelVariants-production.stories.tsx
 * (LOC ceiling).
 */
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { ThreadActivityStatus } from "~/components/t3team-ThreadActivityStatus";
import { ProjectFavicon } from "~/components/ProjectFavicon";

import { EnvironmentId } from "@t3tools/contracts";

export function ProdFrame({
  title,
  children,
}: {
  title: string;
  /** receives the frame's measured available width (same as the real card row) */
  children: (avail: number | undefined) => ReactNode;
}) {
  // same fit-gate math as Sidebar.tsx: row width − insets(20) − favicon(16)
  // − gap(6) − title natural width
  const rowRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLSpanElement>(null);
  const [avail, setAvail] = useState<number | undefined>(undefined);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const t = sizerRef.current?.querySelector<HTMLElement>("[data-t]");
      const w = row.getBoundingClientRect().width;
      setAvail(Math.max(0, Math.floor(w) - 20 - 16 - 6 - (t ? t.offsetWidth : 0)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [title]);
  return (
    <div
      ref={rowRef}
      data-testid="prod-row-card"
      className="rounded-lg border border-zinc-200/70 bg-white shadow-sm dark:border-zinc-700/40 dark:bg-zinc-900"
    >
      <div className="relative h-[4.875rem] px-[var(--sidebar-row-content-inset)] py-[var(--sidebar-content-inset)]">
        <span
          ref={sizerRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-px overflow-hidden opacity-0"
        >
          <span data-t className="inline-block whitespace-nowrap text-xs font-medium">
            {title}
          </span>
        </span>
        <div className="flex h-5 min-w-0 items-center gap-1.5">
          <ProjectFavicon
            environmentId={EnvironmentId.make("env-1")}
            cwd="/tmp/build-40"
            projectName="build-40"
            className="size-4 shrink-0"
          />
          <span className="min-w-0 flex-1 truncate text-secondary-label text-xs font-medium">
            {title}
          </span>
          <span className="ml-auto flex shrink-0 items-center justify-end text-xs">
            {children(avail)}
          </span>
        </div>
      </div>
    </div>
  );
}

const PROD_TITLES = {
  short: "Refactor settings panel",
  long: "Refactor settings panel into a tabbed layout with a live preview pane",
};

export function ProdLiveDemo() {
  const LABELS = ["Reading tests", "Compiling workers", "Fixing the test matrix"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((v) => (v + 1) % LABELS.length), 14000);
    return () => window.clearInterval(t);
  }, []);
  const label = LABELS[i] ?? "";
  const [spin, setSpin] = useState(0);
  const last = useRef(label);
  useEffect(() => {
    if (last.current !== label) {
      last.current = label;
      setSpin((s) => s + 1);
    }
  }, [label]);
  return (
    <ProdFrame title={PROD_TITLES.short}>
      {(avail) => (
        <ThreadActivityStatus
          kind="live"
          label={label}
          timer={<span className="font-mono tabular-nums">4m 12s</span>}
          avail={avail}
          spinTick={spin}
          className="text-sky-600 dark:text-sky-400"
        />
      )}
    </ProdFrame>
  );
}

export function ProdKindDemo() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setDone((v) => !v), 7000);
    return () => window.clearInterval(t);
  }, []);
  return done ? (
    <ProdFrame title={PROD_TITLES.short}>
      {() => (
        <ThreadActivityStatus
          kind="done"
          label="Done"
          className="text-emerald-700 dark:text-emerald-300"
        />
      )}
    </ProdFrame>
  ) : (
    <ProdFrame title={PROD_TITLES.short}>
      {(avail) => (
        <ThreadActivityStatus
          kind="live"
          label="All tests green"
          timer={<span className="font-mono tabular-nums">12m 04s</span>}
          avail={avail}
          className="text-sky-600 dark:text-sky-400"
        />
      )}
    </ProdFrame>
  );
}

export function ProdFitGateDemo() {
  return (
    <ProdFrame title={PROD_TITLES.long}>
      {(avail) => (
        <ThreadActivityStatus
          kind="live"
          label="Running the full checkout matrix across worktrees"
          timer={<span className="font-mono tabular-nums">1h 02m</span>}
          avail={avail}
          className="text-sky-600 dark:text-sky-400"
        />
      )}
    </ProdFrame>
  );
}
