/* oxlint-disable t3code/no-dom-test-environment -- Re-render counts need a DOM; this stays a unit file so CI runs it without Playwright. */
// @vitest-environment jsdom
/* oxlint-disable t3code/require-disposable-render -- Unit-file createRoot, same as other rerender tests. */
import { act, memo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it } from "vite-plus/test";

import { OldAppGuardScreen, type OldAppGuardState } from "./t3team-OldAppGuardScreen";
import { renderCounter } from "~/test/t3team-renderCounter";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const counter = renderCounter();

const CountingScreen = memo(function CountingScreen(props: {
  state: OldAppGuardState;
  onRetry: () => void;
}) {
  counter.count("screen");
  return <OldAppGuardScreen state={props.state} onRetry={props.onRetry} />;
});

describe("OldAppGuardScreen rerender", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    counter.reset();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("rerenders only for a Retry click or a parent state change", () => {
    const clicks: number[] = [];
    const onRetry = () => {
      clicks.push(1);
    };
    act(() => {
      root.render(<CountingScreen state="blocked" onRetry={onRetry} />);
    });
    counter.reset();

    const button = host.querySelector("button");
    if (!(button instanceof HTMLButtonElement)) throw new Error("missing Retry");
    act(() => {
      button.click();
    });
    // Optimistic pending is internal state: the memoized parent does not rerender.
    counter.expectRerendered({});
    if (clicks.length !== 1) throw new Error("Retry was not delivered");
    if (host.querySelector("button")?.textContent !== "Retrying…") {
      throw new Error("optimistic pending did not show");
    }

    counter.reset();
    act(() => {
      root.render(<CountingScreen state="still-running" onRetry={onRetry} />);
    });
    counter.expectRerendered({ screen: 1 });
    if (!host.textContent?.includes("Nexi Work is still running.")) {
      throw new Error("inline error missing");
    }

    counter.reset();
    act(() => {
      root.render(<CountingScreen state="still-running" onRetry={onRetry} />);
    });
    counter.expectRerendered({});
  });
});
