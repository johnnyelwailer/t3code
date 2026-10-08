/**
 * The pieces of My Work's loading animation, shaped like the real digest.
 *
 * Every placeholder mirrors the element it stands in for — the header's kicker/title/status row,
 * `DigestKicker`, `T3SurfacePanel`'s divided card, `DigestItemRow`'s icon + key + title + status
 * cells — and the lanes use `digestLaneLayout`, the same grid the digest itself builds. Content
 * therefore swaps in without a layout shift instead of snapping into a different skeleton's shape.
 */
import type { CSSProperties } from "react";

import { Skeleton } from "~/t3team/components/ui/t3team-skeleton";
import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { digestLaneLayout } from "~/t3team/t3team-projectMyWorkDigestLaneLayout";

/** Rows rise in one after another; 70 ms reads as a sweep without feeling like a queue. */
const STAGGER_STEP_MS = 70;

function stagger(index: number): CSSProperties {
  return { "--t3team-stagger": `${index * STAGGER_STEP_MS}ms` } as CSSProperties;
}

/** One ticket row: type icon dot, key pill, title line, status pill. */
function LoadingRow({ index, wide = false }: { index: number; wide?: boolean | undefined }) {
  return (
    <div
      className="t3team-mywork-loading-rise flex items-center gap-2 px-3 py-2"
      style={stagger(index)}
    >
      <Skeleton shape="pill" className="size-3.5 shrink-0" />
      <Skeleton shape="pill" className="h-3 w-12 shrink-0" />
      <Skeleton className={`h-3.5 ${wide ? "w-[62%]" : "w-[46%]"}`} />
      <Skeleton shape="pill" className="ml-auto h-3 w-14 shrink-0" />
    </div>
  );
}

/** A lane card: the kicker above it, then its divided rows. */
export function MyWorkLoadingCard({
  rows,
  index = 0,
  tone = "muted",
  wide,
}: {
  rows: number;
  index?: number;
  tone?: "default" | "muted";
  wide?: boolean | undefined;
}) {
  return (
    <section className="space-y-2">
      <div className="t3team-mywork-loading-rise flex items-baseline gap-2" style={stagger(index)}>
        <Skeleton className="h-2.5 w-24" />
        <Skeleton shape="pill" className="h-2.5 w-4" />
      </div>
      <T3SurfacePanel tone={tone} className="divide-y divide-border/60">
        {Array.from({ length: rows }, (_, row) => (
          <LoadingRow key={row} index={index + row + 1} wide={wide} />
        ))}
      </T3SurfacePanel>
    </section>
  );
}

/** The header band: kicker, title, right-hand status, and the sprint progress bar. */
export function MyWorkLoadingHeader() {
  return (
    <header className="space-y-4 border-b border-border/70 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2">
        <div className="t3team-mywork-loading-rise space-y-2" style={stagger(0)}>
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="h-6 w-56 sm:h-7 sm:w-72" />
        </div>
        <div className="t3team-mywork-loading-rise flex items-center gap-3" style={stagger(1)}>
          <Skeleton shape="pill" className="h-3 w-20" />
          <Skeleton shape="pill" className="h-3 w-28" />
        </div>
      </div>
      <div className="t3team-mywork-loading-rise" style={stagger(2)}>
        <Skeleton shape="pill" className="h-1 w-full" />
      </div>
    </header>
  );
}

/**
 * The two-lane body: a "Needs you" side card and the main lane's cards. Exported on its own so
 * `ProjectMyWorkDigestView` can keep a real header above it while the lanes are still unknown.
 */
export function MyWorkLoadingLanes() {
  const lanes = digestLaneLayout({ side: 1, main: 1 });
  return (
    <div className={lanes.gridClassName}>
      <div className="min-w-0 space-y-8">
        <MyWorkLoadingCard rows={2} index={3} tone="default" />
      </div>
      <div className="@container/lane min-w-0 space-y-8">
        <MyWorkLoadingCard rows={4} index={6} wide />
        <MyWorkLoadingCard rows={2} index={11} wide />
      </div>
    </div>
  );
}
