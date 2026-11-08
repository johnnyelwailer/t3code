import { expect } from "vite-plus/test";

export interface RenderCounter {
  count: (id: string) => void;
  reset: () => void;
  rerendered: () => string[];
  expectRerendered: (expected: Record<string, number>) => void;
}

/**
 * Count renders inside a memoized per-item wrapper, then reset(), act, expectRerendered().
 * The exact counts since the reset are the budget. Rule and example: docs/internals/t3team-rerender-gate.md.
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
