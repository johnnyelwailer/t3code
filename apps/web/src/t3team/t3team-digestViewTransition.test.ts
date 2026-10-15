// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  digestTransitionStyle,
  digestViewTransitionName,
  runDigestViewTransition,
} from "~/t3team/t3team-digestViewTransition";

type TransitionDocument = {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

function installViewTransitions(): ReturnType<typeof vi.fn> {
  const start = vi.fn((update: () => void) => {
    update();
    return { finished: Promise.resolve() };
  });
  const target: TransitionDocument = document;
  target.startViewTransition = start;
  return start;
}

function removeViewTransitions(): void {
  const target: TransitionDocument = document;
  delete target.startViewTransition;
}

function reducedMotion(requested: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: requested && query.includes("prefers-reduced-motion"),
    })),
  );
}

describe("runDigestViewTransition", () => {
  beforeEach(() => {
    reducedMotion(false);
  });
  afterEach(() => {
    removeViewTransitions();
    vi.unstubAllGlobals();
  });

  it("applies the update at once where view transitions do not exist", () => {
    removeViewTransitions();
    const update = vi.fn();

    runDigestViewTransition(update);

    expect(update).toHaveBeenCalledTimes(1);
  });

  it("applies the update without animating when the reader asked for reduced motion", () => {
    const start = installViewTransitions();
    reducedMotion(true);
    const update = vi.fn();

    runDigestViewTransition(update);

    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("wraps the update in one view transition tagged for the digest styles", () => {
    const start = installViewTransitions();
    let typesWhileRunning: string | null = null;
    const update = vi.fn(() => {
      typesWhileRunning = document.documentElement.getAttribute(
        "data-t3team-view-transition-types",
      );
    });

    runDigestViewTransition(update);

    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(typesWhileRunning).toBe("digest");
  });

  it("clears the digest tag once the transition has finished", async () => {
    installViewTransitions();

    runDigestViewTransition(() => undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(document.documentElement.getAttribute("data-t3team-view-transition-types")).toBeNull();
  });
});

describe("digestViewTransitionName", () => {
  it("is a valid CSS identifier for any ticket or section id", () => {
    for (const id of ["issue-101", "7f3c9a2e-aaaa-bbbb", "needs you", "a.b/c", "ünï", "10"]) {
      expect(digestViewTransitionName("row", id)).toMatch(/^t3-digest-row-[A-Za-z0-9_-]+$/);
    }
  });

  it("never gives two different ids the same name", () => {
    const ids = ["a.b", "a_b", "a b", "a-b", "a_2e_b", "A.b"];
    const names = new Set(ids.map((id) => digestViewTransitionName("row", id)));

    expect(names.size).toBe(ids.length);
  });

  it("keeps a ticket and a section with the same id apart", () => {
    expect(digestViewTransitionName("row", "x")).not.toBe(digestViewTransitionName("section", "x"));
  });
});

describe("digestTransitionStyle", () => {
  it("styles only parts that have a name", () => {
    expect(digestTransitionStyle(undefined)).toBeUndefined();
    expect(digestTransitionStyle("t3-digest-row-a")).toEqual({
      viewTransitionName: "t3-digest-row-a",
    });
  });
});
