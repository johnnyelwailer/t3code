/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useDebouncedValue } from "./t3team-useDebouncedValue";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("useDebouncedValue", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    host?.remove();
    root = null;
    host = null;
    vi.useRealTimers();
  });

  it("only reflects the value after the delay elapses, using the latest value", () => {
    const latest: { value: string } = { value: "" };

    function Harness({ value }: { value: string }) {
      latest.value = useDebouncedValue(value, 250);
      return null;
    }

    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() => {
      root?.render(<Harness value="a" />);
    });
    expect(latest.value).toBe("a");

    act(() => {
      root?.render(<Harness value="ab" />);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // Still the initial value: not enough time has passed since the latest change.
    expect(latest.value).toBe("a");

    act(() => {
      root?.render(<Harness value="abc" />);
    });
    act(() => {
      vi.advanceTimersByTime(249);
    });
    // The 250ms window keeps resetting on every keystroke, so "ab" never fires either.
    expect(latest.value).toBe("a");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(latest.value).toBe("abc");
  });
});
