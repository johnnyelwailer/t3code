// @vitest-environment jsdom
/**
 * A pack's `message.view`, end to end on the web side: the thread artifact a workflow's
 * `showView` writes → the timeline's artifact join → `MessagesTimeline` → the registry → the
 * pack's own component, inside its pack scope and error boundary.
 */
import type { PackDoc } from "@t3team/pack-ui/contract";
import { defineWebActivate } from "@t3team/pack-ui/contract";
import type { T3TeamThreadArtifact } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { act, type ReactNode, type Ref } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import type { LegendListRef } from "@legendapp/list/react";

import { activateMessageViewPacks } from "~/t3team/chat/t3team-messageViewRegistry";
import { T3TeamSystemTimelineRow } from "~/t3team/chat/t3team-SystemTimelineRow";
import { buildT3TeamMessagesTimelineTestProps } from "~/t3team/chat/t3team-messagesTimelineTestProps";
import { decorateT3TeamTimelineEntries } from "~/t3team/chat/t3team-timelineArtifacts";

import { type PackDocumentQuery, setPackDocumentSource } from "./t3team-packDocuments";
import { standupPackWebModule, standupShowViewArtifact } from "./t3team-standupPackFixtures";

vi.mock("@legendapp/list/react", async () => {
  const LegendList = (props: {
    data: Array<{ id: string }>;
    keyExtractor: (item: { id: string }) => string;
    renderItem: (args: { item: { id: string } }) => ReactNode;
    ref?: Ref<LegendListRef>;
  }) => (
    <div>
      {props.data.map((item) => (
        <div key={props.keyExtractor(item)}>{props.renderItem({ item })}</div>
      ))}
    </div>
  );
  return { LegendList };
});

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let crashingRenders = 0;
const Crashing = (): ReactNode => {
  crashingRenders += 1;
  throw new Error("view bug");
};

beforeAll(async () => {
  await import("~/components/chat/MessagesTimeline");
  activateMessageViewPacks([
    standupPackWebModule,
    {
      packId: "crashy",
      activate: defineWebActivate((context) =>
        context.registerView({
          slot: "message.view",
          id: "crashy.card",
          props: Schema.Struct({ cardId: Schema.String }),
          component: Crashing,
        }),
      ),
    },
  ]);
}, 60_000);

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = [];
afterEach(async () => {
  setPackDocumentSource(null);
  vi.restoreAllMocks();
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

async function mountTimeline() {
  const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  return async (artifacts: ReadonlyArray<T3TeamThreadArtifact>): Promise<string> => {
    const timelineEntries = decorateT3TeamTimelineEntries({
      entries: [],
      artifacts,
      contextByMessageId: new Map(),
    });
    await act(async () => {
      root.render(
        <MessagesTimeline
          {...buildT3TeamMessagesTimelineTestProps()}
          timelineEntries={timelineEntries}
        />,
      );
    });
    return container.textContent ?? "";
  };
}

async function mountArtifacts(artifacts: ReadonlyArray<T3TeamThreadArtifact>): Promise<string> {
  return (await mountTimeline())(artifacts);
}

const notes = { day: "Mon", notes: ["Shipped the view registry"] };

describe("a pack message view in the timeline", () => {
  it("renders the pack's component for a showView artifact", async () => {
    const text = await mountArtifacts([
      standupShowViewArtifact({ threadId: "thread-1", key: "standup:mon", props: notes }),
    ]);

    expect(text).toContain("Standup · Mon");
    expect(text).toContain("Shipped the view registry");
    expect(text).toContain("1 notes");
    // No pack store on this host: the view renders its no-store state, not a spinner.
    expect(text).not.toContain("earlier entries");
  });

  it("reads documents for its own pack only", async () => {
    const queries: PackDocumentQuery[] = [];
    const document = (key: string): PackDoc => ({ key, version: 1, doc: {}, updatedAt: "" });
    setPackDocumentSource({
      subscribe: (query, onDocuments) => {
        queries.push(query);
        onDocuments([document("standup/Mon/a"), document("standup/Mon/b")]);
        return () => {};
      },
    });

    const text = await mountArtifacts([
      standupShowViewArtifact({ threadId: "thread-1", key: "standup:mon", props: notes }),
    ]);

    expect(text).toContain("2 earlier entries");
    expect(queries).toEqual([{ packId: "standup", collection: "standup", prefix: "standup/Mon/" }]);
  });

  it("falls back to the generic attachment row when the props do not decode", async () => {
    const text = await mountArtifacts([
      standupShowViewArtifact({ threadId: "thread-1", key: "bad", props: { day: 3 } }),
    ]);

    expect(text).not.toContain("Standup ·");
    expect(text).toContain("standup.notes");
  });

  it("contains a view that throws to a one-line notice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const artifact = standupShowViewArtifact({ threadId: "thread-1", key: "crash", props: {} });
    const crashing = {
      ...artifact,
      payload: {
        ...(artifact.payload as object),
        attachments: [{ kind: "view", miniappId: "crashy.card", props: { cardId: "c1" } }],
      },
    };

    const text = await mountArtifacts([
      crashing,
      standupShowViewArtifact({ threadId: "thread-1", key: "standup:mon", props: notes }),
    ]);

    expect(text).toContain("This view (crashy.card) could not be shown.");
    expect(text).toContain("Standup · Mon");
  });

  it("keeps a crashed view down when its row re-renders with the same attachment", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const artifact = standupShowViewArtifact({ threadId: "thread-1", key: "crash", props: {} });
    const [entry] = decorateT3TeamTimelineEntries({
      entries: [],
      artifacts: [
        {
          ...artifact,
          payload: {
            ...(artifact.payload as object),
            attachments: [{ kind: "view", miniappId: "crashy.card", props: { cardId: "c1" } }],
          },
        },
      ],
      contextByMessageId: new Map(),
    });
    if (entry?.kind !== "message") throw new Error("expected a message row");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    const renderRow = (workflowRunStatus: "running" | "completed") =>
      act(async () =>
        root.render(
          <T3TeamSystemTimelineRow
            message={entry.message}
            threadRef={null}
            activeWorkflowInputMessageId={null}
            workflowRunStatus={workflowRunStatus}
          />,
        ),
      );
    await renderRow("running");
    const rendersAfterCrash = crashingRenders;

    // The run finishes: the row re-renders, its attachment unchanged.
    await renderRow("completed");

    expect(container.textContent).toContain("This view (crashy.card) could not be shown.");
    expect(crashingRenders).toBe(rendersAfterCrash);
  });
});
