import { describe, expect, it, vi } from "vite-plus/test";

import { navigateBackWithFallback } from "~/t3team/t3team-historyBack";

describe("navigateBackWithFallback", () => {
  it("uses browser history when the router can go back", () => {
    const onFallback = vi.fn();
    const originalWindow = globalThis.window;
    const back = vi.fn();

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        history: {
          back,
        },
      },
    });

    try {
      navigateBackWithFallback({ canGoBack: true, onFallback });
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }

    expect(back).toHaveBeenCalledTimes(1);
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("falls back when the router cannot go back", () => {
    const onFallback = vi.fn();

    navigateBackWithFallback({ canGoBack: false, onFallback });

    expect(onFallback).toHaveBeenCalledTimes(1);
  });
});
