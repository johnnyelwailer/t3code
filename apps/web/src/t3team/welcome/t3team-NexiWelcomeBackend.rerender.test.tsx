/* oxlint-disable t3code/no-dom-test-environment -- The re-render gate requires this sibling name, which is not a browser test; the unit file sets jsdom. */
/* oxlint-disable t3code/require-disposable-render -- The shared render helper imports vite-plus/test/browser and can only run in Browser Mode. */
// @vitest-environment jsdom
/**
 * NexiWelcomeBackend creates one backend client and connects it for the life
 * of the page. A parent state change must not create or reconnect a client,
 * and a memoized consumer of that client must not re-render. The render
 * count is the budget.
 */
import { act, memo, useContext, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { NexiWelcomeBackend } from "./t3team-NexiWelcomeBackend";
import { renderCounter } from "~/test/t3team-renderCounter";

const harness = vi.hoisted(() => {
  const React = require("react") as typeof import("react");
  const BackendContext = React.createContext<unknown>(null);
  const createT3Backend = vi.fn();
  const resolveWsBaseUrl = vi.fn(() => "ws://welcome-test");
  const count = { fn: (_id: string) => {} };
  return { BackendContext, createT3Backend, resolveWsBaseUrl, count };
});

vi.mock("~/t3team/backend/t3team-index", () => ({
  createT3Backend: harness.createT3Backend,
  BackendProvider: ({ backend, children }: { backend: unknown; children?: ReactNode }) => {
    harness.count.fn("provider");
    const Provider = harness.BackendContext.Provider;
    return <Provider value={backend}>{children}</Provider>;
  },
}));

vi.mock("~/t3team/t3team-route-surface-wsUrl", () => ({
  resolveWsBaseUrl: () => harness.resolveWsBaseUrl(),
}));

const counter = renderCounter();
harness.count.fn = (id: string) => counter.count(id);

function makeBackend() {
  return {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  };
}

const CountingConsumer = memo(function CountingConsumer() {
  counter.count("consumer");
  useContext(harness.BackendContext);
  return <div data-testid="consumer">child</div>;
});

function Parent() {
  const [tick, setTick] = useState(0);
  return (
    <div>
      <button type="button" data-testid="tick" onClick={() => setTick((value) => value + 1)}>
        {tick}
      </button>
      <NexiWelcomeBackend>
        <CountingConsumer />
      </NexiWelcomeBackend>
    </div>
  );
}

describe("NexiWelcomeBackend re-renders", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    harness.createT3Backend.mockReset();
    harness.createT3Backend.mockImplementation(makeBackend);
    harness.resolveWsBaseUrl.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    counter.reset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("does not reconnect or re-render a memoized consumer when the parent ticks", async () => {
    await act(async () => {
      root.render(<Parent />);
    });
    expect(harness.createT3Backend).toHaveBeenCalledTimes(1);
    expect(harness.createT3Backend).toHaveBeenCalledWith("ws://welcome-test");
    expect(harness.resolveWsBaseUrl).toHaveBeenCalledTimes(1);
    const backend = harness.createT3Backend.mock.results[0]!.value as ReturnType<
      typeof makeBackend
    >;
    expect(backend.connect).toHaveBeenCalledTimes(1);
    expect(backend.disconnect).not.toHaveBeenCalled();
    counter.expectRerendered({ provider: 1, consumer: 1 });

    counter.reset();
    await act(async () => {
      const tickButton = container.querySelector<HTMLButtonElement>("[data-testid='tick']");
      expect(tickButton).not.toBeNull();
      tickButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector("[data-testid='tick']")?.textContent).toBe("1");
    // A parent state change must not recreate the client or reach the consumer.
    // The provider itself is not a required re-render: sitting it out is also correct.
    expect(counter.rerendered()).not.toContain("consumer");
    const providerRenders = counter.rerendered().includes("provider") ? 1 : 0;
    expect(providerRenders).toBeLessThanOrEqual(1);
    if (providerRenders === 1) {
      counter.expectRerendered({ provider: 1 });
    } else {
      counter.expectRerendered({});
    }
    expect(harness.createT3Backend).toHaveBeenCalledTimes(1);
    expect(backend.connect).toHaveBeenCalledTimes(1);
    expect(backend.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects on unmount, and a remount gets a fresh client", async () => {
    await act(async () => {
      root.render(<Parent />);
    });
    const first = harness.createT3Backend.mock.results[0]!.value as ReturnType<typeof makeBackend>;
    await act(async () => {
      root.unmount();
    });
    expect(first.disconnect).toHaveBeenCalledTimes(1);
    expect(first.connect).toHaveBeenCalledTimes(1);

    root = createRoot(container);
    counter.reset();
    await act(async () => {
      root.render(<Parent />);
    });
    expect(harness.createT3Backend).toHaveBeenCalledTimes(2);
    const second = harness.createT3Backend.mock.results[1]!.value as ReturnType<typeof makeBackend>;
    expect(second).not.toBe(first);
    expect(second.connect).toHaveBeenCalledTimes(1);
    expect(second.disconnect).not.toHaveBeenCalled();
    expect(first.disconnect).toHaveBeenCalledTimes(1);
    counter.expectRerendered({ provider: 1, consumer: 1 });
  });
});
