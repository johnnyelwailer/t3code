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

const publish = vi.fn((_context: T3TeamViewContext | null) => Promise.resolve());
const make = () => createViewContextPublisher({ publish });
const elapse = (ms: number) => vi.advanceTimersByTime(ms);
const sent = () => publish.mock.calls.map(([sentContext]) => sentContext?.filters["query"] ?? null);

beforeEach(() => {
  vi.useFakeTimers();
  publish.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("createViewContextPublisher", () => {
  it("sends only the last of a burst, after the debounce", () => {
    const publisher = make();
    publisher.update(context("a"));
    elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS - 1);
    publisher.update(context("ab"));
    elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS - 1);
    expect(sent()).toEqual([]);
    elapse(1);
    expect(sent()).toEqual(["ab"]);
  });

  it("drops a context equal to the last one sent, and sends a changed one", () => {
    const publisher = make();
    publisher.update(context("a"));
    elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS);
    publisher.update(context("a"));
    elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS * 2);
    expect(sent()).toEqual(["a"]);
    publisher.update(context("b"));
    elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS);
    expect(sent()).toEqual(["a", "b"]);
  });

  it("resends after a failed publication", async () => {
    publish.mockRejectedValueOnce(new Error("offline"));
    const publisher = make();
    publisher.update(context("a"));
    await vi.advanceTimersByTimeAsync(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS);
    publisher.update(context("a"));
    elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS);
    expect(sent()).toEqual(["a", "a"]);
  });

  it("clears the server entry on dispose only if something was sent, and drops a pending send", () => {
    const idle = make();
    idle.update(context("a"));
    idle.dispose();
    elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS * 2);
    expect(sent()).toEqual([]);

    const active = make();
    active.update(context("a"));
    elapse(VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS);
    active.dispose();
    expect(sent()).toEqual(["a", null]);
  });
});
