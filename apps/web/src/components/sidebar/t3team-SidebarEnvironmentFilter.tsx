import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import type { EnvironmentFilterPill } from "@t3tools/client-runtime/t3team-environmentFilter";

import { observeResize } from "~/lib/observeResize";

import {
  T3TeamSidebarEnvironmentFilterPill,
  T3TeamSidebarEnvironmentFilterOverflowMeasure,
} from "./t3team-SidebarEnvironmentFilterPill";
import { T3TeamSidebarEnvironmentFilterPicker } from "./t3team-SidebarEnvironmentFilterPicker";
import { useSidebarPillRowWidth } from "./t3team-SidebarPillRowMeasure";
import {
  ENVIRONMENT_FILTER_PILL_GAP,
  environmentFilterPillCapacity,
} from "./t3team-sidebarEnvironmentFilter.logic";

/**
 * One-click environment filter under the project pills: "All" plus one pill per environment the
 * list shows something for. `pills` is null while there is nothing to choose, and nothing draws.
 * The row stays one line: whatever does not fit folds into a +N pill that opens the full list,
 * the way the project discs already do.
 */
export function T3TeamSidebarEnvironmentFilter({
  pills,
  onSelect,
}: {
  pills: ReadonlyArray<EnvironmentFilterPill> | null;
  onSelect: (environmentId: string | null) => void;
}) {
  if (pills === null) return null;
  return <T3TeamSidebarEnvironmentFilterRow pills={pills} onSelect={onSelect} />;
}

type PillSizes = {
  readonly pillWidths: number[];
  readonly overflowWidth: number;
};

/**
 * An invisible twin of the row measures every pill, plus the widest +N, so the split is a pure
 * sum of rendered widths instead of a guess.
 */
function useEnvironmentPillSizes(
  pills: ReadonlyArray<EnvironmentFilterPill>,
): [RefObject<HTMLDivElement | null>, PillSizes | null] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [sizes, setSizes] = useState<PillSizes | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- measures the pill DOM before paint and re-measures when the pills change
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const read = () => {
      const children = Array.from(node.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      );
      if (children.length !== pills.length + 1) return;
      setSizes({
        pillWidths: children.slice(0, -1).map((child) => child.offsetWidth),
        overflowWidth: children.at(-1)?.offsetWidth ?? 0,
      });
    };
    read();
    return observeResize(node, () => read());
  }, [pills]);
  return [ref, sizes];
}

function T3TeamSidebarEnvironmentFilterRow({
  pills,
  onSelect,
}: {
  pills: ReadonlyArray<EnvironmentFilterPill>;
  onSelect: (environmentId: string | null) => void;
}) {
  const [rowRef, rowWidth] = useSidebarPillRowWidth();
  const [measureRef, sizes] = useEnvironmentPillSizes(pills);
  const shownCount =
    rowWidth === null || sizes === null
      ? 0
      : environmentFilterPillCapacity(
          sizes.pillWidths,
          rowWidth,
          ENVIRONMENT_FILTER_PILL_GAP,
          sizes.overflowWidth,
        );
  const shown = pills.slice(0, shownCount);
  const hiddenCount = pills.length - shown.length;
  return (
    <div role="group" aria-label="Environment" className="relative min-w-0 py-0.5 pl-2">
      <div
        ref={measureRef}
        aria-hidden="true"
        className="invisible absolute inset-x-0 top-0 flex items-center gap-1"
      >
        {pills.map((pill) => (
          <T3TeamSidebarEnvironmentFilterPill
            key={pill.id ?? "all"}
            pill={pill}
            onSelect={() => {}}
          />
        ))}
        <T3TeamSidebarEnvironmentFilterOverflowMeasure count={pills.length - 1} />
      </div>
      <div ref={rowRef} className="flex min-w-0 items-center gap-1 overflow-hidden">
        {shown.map((pill) => (
          <T3TeamSidebarEnvironmentFilterPill
            key={pill.id ?? "all"}
            pill={pill}
            onSelect={onSelect}
          />
        ))}
        {hiddenCount > 0 ? (
          <T3TeamSidebarEnvironmentFilterPicker
            pills={pills}
            hiddenCount={hiddenCount}
            onSelect={onSelect}
          />
        ) : null}
      </div>
    </div>
  );
}
