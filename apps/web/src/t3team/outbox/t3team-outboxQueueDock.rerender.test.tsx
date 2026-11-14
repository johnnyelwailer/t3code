/* oxlint-disable t3code/no-dom-test-environment -- Re-render counts need a DOM; this stays a unit file so CI runs it without Playwright. */
// @vitest-environment jsdom
/* oxlint-disable t3code/require-disposable-render -- Unit-file createRoot, same as the other rerender tests. */
import { DEFAULT_PROVIDER_INTERACTION_MODE, DEFAULT_RUNTIME_MODE } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it, vi } from "vite-plus/test";

import { setThreadSendInFlight } from "~/t3team/chat/t3team-sendConfirmationStore";
import { renderCounter } from "~/test/t3team-renderCounter";

import { makeT3TeamOutboxEntry } from "./t3team-outboxModel";
import { T3TeamOutboxQueueDock } from "./t3team-outboxQueueDock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const counter = renderCounter();

// Each row reads its environment once per render; one environment per row counts row renders.
vi.mock("~/state/environments", () => ({
  useEnvironment: (environmentId: string) => {
    counter.count(environmentId);
    return { label: "Build server", connection: { phase: "connected" } };
  },
}));

const entry = (row: string, threadId: string) =>
  makeT3TeamOutboxEntry(
    "turn-start",
    {
      messageId: `m-${row}`,
      messageText: `Bitte führe die Tests für ${row} erneut aus und berichte das Ergebnis.`,
      modelSelection: null,
      titleSeed: row,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      createdAt: "2026-11-14T15:00:00.000Z",
    },
    row,
    threadId,
  );

const ENTRIES = [entry("row-a", "thread-a"), entry("row-b", "thread-b")];

describe("T3TeamOutboxQueueDock re-renders", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    for (const thread of ["thread-a", "thread-b", "thread-c"]) setThreadSendInFlight(thread, false);
  });

  it("a send starting on one thread re-renders only that thread's row", async () => {
    await act(async () => {
      root.render(
        <T3TeamOutboxQueueDock entries={ENTRIES} dispatchingEntryId={null} failures={{}} />,
      );
    });
    counter.reset();
    await act(async () => {
      setThreadSendInFlight("thread-a", true);
    });
    counter.expectRerendered({ "row-a": 1 });
  });

  it("a send on a thread with no queued entry re-renders no row", async () => {
    await act(async () => {
      root.render(
        <T3TeamOutboxQueueDock entries={ENTRIES} dispatchingEntryId={null} failures={{}} />,
      );
    });
    counter.reset();
    await act(async () => {
      setThreadSendInFlight("thread-c", true);
    });
    counter.expectRerendered({});
  });
});
