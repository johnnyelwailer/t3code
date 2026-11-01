import type { T3TeamViewContext } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createViewContextPublisher,
  VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS,
} from "./t3team-viewContextPublisher";

const context = (query: string): T3TeamViewContext => ({
  version: 1,
  surface: "my-work",
  projectId: "p1",
  selection: null,
  filters: { query },
  visibleItemIds: ["a"],
  visibleItemCount: 1,
});

const publish = vi.fn((_context: T3TeamViewContext | null, _sequence: number) => Promise.resolve());
const make = () => createViewContextPublisher({ publish });
const elapse = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const sent = () => publish.mock.calls.map(([sentContext]) => sentContext?.filters["query"] ?? null);

beforeEach(() => {
  vi.useFakeTimers();
  publish.mockClear();
  publish.mockImplementation(() => Promise.resolve());
});
afterEach(() => vi.useRealTimers());

describe("createViewContextPublisher", () => {
  it("sends only the last of a burst, after the debounce", async () => {
    const publisher = make();
    publisher.update(context("a"));
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS - 1);
    publisher.update(context("ab"));
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS - 1);
    expect(sent()).toEqual([]);
    await elapse(1);
    expect(sent()).toEqual(["ab"]);
  });

  it("drops a context equal to what the server holds, and sends a changed one", async () => {
    const publisher = make();
    publisher.update(context("a"));
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS);
    publisher.update(context("a"));
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS * 2);
    expect(sent()).toEqual(["a"]);
    publisher.update(context("b"));
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS);
    expect(sent()).toEqual(["a", "b"]);
  });

  it("resends after a failed publication", async () => {
    publish.mockRejectedValueOnce(new Error("offline"));
    const publisher = make();
    publisher.update(context("a"));
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS);
    publisher.update(context("a"));
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS);
    expect(sent()).toEqual(["a", "a"]);
  });

  it("clears the server entry when the view reports nothing, and only if something was sent", async () => {
    const idle = make();
    idle.update(null);
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS * 2);
    expect(sent()).toEqual([]);

    const publisher = make();
    publisher.update(context("a"));
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS);
    publisher.update(null);
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS);
    expect(sent()).toEqual(["a", null]);
    publisher.update(null);
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS * 2);
    expect(sent()).toEqual(["a", null]);
  });

  it("flushes a clear on dispose and drops a pending send", async () => {
    const idle = make();
    idle.update(context("a"));
    idle.dispose();
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS * 2);
    expect(sent()).toEqual([]);

    const active = make();
    active.update(context("a"));
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS);
    active.dispose();
    await elapse(0);
    expect(sent()).toEqual(["a", null]);
  });

  it("never lets a late publish overtake a clear: requests run in order with rising sequences", async () => {
    let finishFirst: () => void = () => undefined;
    publish.mockImplementationOnce(() => new Promise<void>((resolve) => (finishFirst = resolve)));
    const publisher = make();
    publisher.update(context("a"));
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS);
    publisher.update(null);
    await elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS);
    expect(sent()).toEqual(["a"]);
    finishFirst();
    await elapse(0);
    expect(sent()).toEqual(["a", null]);
    const [first, second] = publish.mock.calls.map(([, sequence]) => sequence);
    expect(second).toBeGreaterThan(first ?? Infinity);
  });
});
