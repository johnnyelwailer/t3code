import { expect } from 'vite-plus/test';

export interface RenderCounter {
  count: (id: string) => void;
  reset: () => void;
  rerendered: () => string[];
  expectRerendered: (expected: Record<string, number>) => void;
}

/**
 * Per-test render budget for re-render regression tests.
 *
 * Count renders inside a memoized per-item wrapper — the same kind of memo
 * barrier that protects the list — so the count rises only when that item
 * re-renders:
 *
 * ```tsx
 * const counter = renderCounter();
 *
 * const CountingRow = memo(function CountingRow(props: { rowId: string }) {
 *   counter.count(props.rowId);
 *   return <ThreadRowItem ... />;
 * });
 * ```
 *
 * The wrapper receives only referentially-stable props, the way the fixed
 * call site does, so it bails out exactly when the row does. Typical flow:
 * mount, `reset()`, act, then `expectRerendered` — which asserts the exact
 * counts since the reset, failing on both extra and missing entries.
 *
 * See `docs/internals/t3team-rerender-gate.md` for the rule this helper
 * supports: every interactive component a PR touches ships a re-render test
 * or a `Rerender: n/a` exemption line.
 */
export function renderCounter(): RenderCounter {
  const counts = new Map<string, number>();

  function count(id: string): void {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  function reset(): void {
    counts.clear();
  }

  function rerendered(): string[] {
    return [...counts.entries()]
      .filter(([, n]) => n > 0)
      .map(([id]) => id)
      .toSorted();
  }

  function expectRerendered(expected: Record<string, number>): void {
    const actual: Record<string, number> = {};
    for (const [id, n] of counts) {
      actual[id] = n;
    }
    expect(actual).toEqual(expected);
  }

  return { count, reset, rerendered, expectRerendered };
}
