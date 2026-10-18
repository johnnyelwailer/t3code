// t3team: fork-only MessagesTimeline coverage (copy affordance, background bash jobs, working row).
// Upstream's own cases live in MessagesTimeline.browser.test.tsx; this keeps the fork harness.
// @vitest-environment jsdom

import {
  ApprovalRequestId,
  CheckpointRef,
  EnvironmentId,
  MessageId,
  ProjectId,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import {
  act,
  createRef,
  useLayoutEffect,
  useState,
  type ReactNode,
  type Ref,
  type ReactElement,
} from "react";
// @effect-diagnostics nodeBuiltinImport:off - Regression coverage asserts the narrow-panel clamp rules in t3team-index-aciLead.css.
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { shouldUseRestingComposerLayout } from "../composerFooterLayout";
import { useComposerFocusState } from "./useComposerFocusState";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { LegendListRef } from "@legendapp/list/react";
import type { ChatMessage } from "../../types";

const activityTestState = vi.hoisted(() => ({
  expanded: false,
  expandedRuns: false,
  subagentTooltips: false,
}));

vi.mock("../ui/tooltip", async (importOriginal) => {
  const original = await importOriginal<typeof import("../ui/tooltip")>();
  return {
    ...original,
    Tooltip: (props: { children?: ReactNode }) =>
      activityTestState.subagentTooltips ? props.children : <original.Tooltip {...props} />,
    TooltipTrigger: (props: { children?: ReactNode; render?: ReactElement }) =>
      activityTestState.subagentTooltips ? (
        <>
          {props.render}
          {props.children}
        </>
      ) : (
        <original.TooltipTrigger {...props} />
      ),
    TooltipPopup: (props: { children?: ReactNode }) =>
      activityTestState.subagentTooltips ? props.children : <original.TooltipPopup {...props} />,
  };
});

vi.mock("../DiffWorkerPoolProvider", () => ({
  DiffWorkerPoolProvider: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock("./MessagesTimeline.logic", async (importOriginal) => {
  const logic = await importOriginal<typeof import("./MessagesTimeline.logic")>();
  return {
    ...logic,
    deriveMessagesTimelineRowsWithState(
      input: Parameters<typeof logic.deriveMessagesTimelineRowsWithState>[0],
      previous: Parameters<typeof logic.deriveMessagesTimelineRowsWithState>[1],
    ) {
      if (activityTestState.expandedRuns) {
        input = { ...input, expandedRunIds: new Set([RunId.make("run-1")]) };
      }
      const projection = logic.deriveMessagesTimelineRowsWithState(input, previous);
      if (!activityTestState.expanded) return projection;
      return logic.deriveMessagesTimelineRowsWithState({
        ...input,
        expandedWorkGroupIds: new Set(
          projection.rows.flatMap((row) =>
            row.kind === "work-toggle" || row.kind === "work-live" ? [row.groupId] : [],
          ),
        ),
      });
    },
  };
});

beforeEach(() => {
  activityTestState.subagentTooltips = false;
  activityTestState.expanded = false;
  activityTestState.expandedRuns = false;
});

const legendListTestState = vi.hoisted(() => ({
  data: undefined as unknown,
  onScroll: undefined as (() => void) | undefined,
}));

vi.mock("@legendapp/list/react", async () => {
  const legendListTestId = "legend-list";

  const LegendList = (props: {
    data: Array<{ id: string }>;
    keyExtractor: (item: { id: string }) => string;
    renderItem: (args: { item: { id: string } }) => ReactNode;
    ListHeaderComponent?: ReactNode;
    ListFooterComponent?: ReactNode;
    anchoredEndSpace?: {
      anchorIndex: number;
      anchorMaxSize?: number;
      anchorOffset?: number;
      onReady?: (info: { anchorIndex: number }) => void;
      onSizeChanged?: (size: number) => void;
    };
    maintainScrollAtEnd?:
      | boolean
      | {
          animated?: boolean;
          on?: {
            dataChange?: boolean;
            itemLayout?: boolean;
            layout?: boolean;
          };
        };
    maintainVisibleContentPosition?:
      | boolean
      | {
          data?: boolean;
          size?: boolean;
          shouldRestorePosition?: boolean;
        };
    className?: string;
    contentInsetEndAdjustment?: number;
    onScroll?: () => void;
    ref?: Ref<LegendListRef>;
  }) => {
    legendListTestState.data = props.data;
    legendListTestState.onScroll = props.onScroll;
    if (props.anchoredEndSpace) {
      props.anchoredEndSpace.onSizeChanged?.(240);
      props.anchoredEndSpace.onReady?.({ anchorIndex: props.anchoredEndSpace.anchorIndex });
    }
    return (
      <div
        data-testid={legendListTestId}
        data-class-name={props.className}
        data-anchor-index={props.anchoredEndSpace?.anchorIndex}
        data-anchor-max-size={props.anchoredEndSpace?.anchorMaxSize}
        data-anchor-offset={props.anchoredEndSpace?.anchorOffset}
        data-anchor-on-ready={Boolean(props.anchoredEndSpace?.onReady)}
        data-content-inset-end={props.contentInsetEndAdjustment}
        data-maintain-visible-content-position={
          typeof props.maintainVisibleContentPosition === "object"
            ? "object"
            : props.maintainVisibleContentPosition
        }
        data-maintain-visible-content-position-data={
          typeof props.maintainVisibleContentPosition === "object"
            ? props.maintainVisibleContentPosition.data
            : undefined
        }
        data-maintain-visible-content-position-size={
          typeof props.maintainVisibleContentPosition === "object"
            ? props.maintainVisibleContentPosition.size
            : undefined
        }
        data-maintain-visible-content-position-restore={
          typeof props.maintainVisibleContentPosition === "object"
            ? Boolean(props.maintainVisibleContentPosition.shouldRestorePosition)
            : undefined
        }
        data-maintain-scroll-at-end={props.maintainScrollAtEnd ? "enabled" : undefined}
        data-maintain-scroll-at-end-animated={
          typeof props.maintainScrollAtEnd === "object"
            ? props.maintainScrollAtEnd.animated
            : undefined
        }
        data-maintain-scroll-at-end-data-change={
          typeof props.maintainScrollAtEnd === "object"
            ? props.maintainScrollAtEnd.on?.dataChange
            : undefined
        }
        data-maintain-scroll-at-end-item-layout={
          typeof props.maintainScrollAtEnd === "object"
            ? props.maintainScrollAtEnd.on?.itemLayout
            : undefined
        }
        data-maintain-scroll-at-end-layout={
          typeof props.maintainScrollAtEnd === "object"
            ? props.maintainScrollAtEnd.on?.layout
            : undefined
        }
      >
        {props.ListHeaderComponent}
        {props.data.map((item) => (
          <div key={props.keyExtractor(item)}>{props.renderItem({ item })}</div>
        ))}
        {props.ListFooterComponent}
      </div>
    );
  };

  return { LegendList };
});

function MockFileDiff(props: {
  fileDiff: { name?: string | null; prevName?: string | null };
  renderCustomHeader?: (fileDiff: {
    name?: string | null;
    prevName?: string | null;
  }) => React.ReactNode;
}) {
  return (
    <div data-testid="file-diff">
      {props.renderCustomHeader?.(props.fileDiff)}
      {props.fileDiff.name ?? props.fileDiff.prevName ?? "diff"}
    </div>
  );
}

vi.mock("@pierre/diffs/react", () => {
  return { FileDiff: MockFileDiff };
});

// t3team: the real step label runs a hover useSyncExternalStore, which SSR
// (renderToStaticMarkup) cannot run; the working-row tests only need its slot.
vi.mock("~/t3team/chat/t3team-activeAgentsStepLabel", () => ({
  T3TeamActiveAgentsStepLabel: ({ label }: { label: string | null }) =>
    label ? <span data-testid="active-agents-step-label">{label}</span> : null,
}));

function matchMedia() {
  return {
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

let MessagesTimeline: typeof import("./MessagesTimeline").MessagesTimeline;

const ElementStub = class ElementStub {};
function stubDomGlobals() {
  const classList = {
    add: () => {},
    remove: () => {},
    toggle: () => {},
    contains: () => false,
  };

  vi.stubGlobal("Element", ElementStub);
  vi.stubGlobal("getComputedStyle", undefined);
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  });
  vi.stubGlobal("window", {
    Element: ElementStub,
    localStorage: globalThis.localStorage,
    matchMedia,
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    },
    cancelAnimationFrame: () => {},
    desktopBridge: undefined,
  });
  vi.stubGlobal("document", {
    documentElement: {
      classList,
      offsetHeight: 0,
    },
  });
}

beforeEach(stubDomGlobals);
// Cold transformation of the full chat dependency graph needs extra time on slower CI workers.
beforeAll(async () => {
  Object.defineProperty(window, "matchMedia", { value: matchMedia, configurable: true });
  ({ MessagesTimeline } = await import("./MessagesTimeline"));
}, 120_000);

const ACTIVE_THREAD_ENVIRONMENT_ID = EnvironmentId.make("environment-local");
const MESSAGE_CREATED_AT = "2026-03-17T19:12:28.000Z";

function buildProps() {
  return {
    isWorking: false,
    activeTurnInProgress: false,
    listRef: createRef<LegendListRef | null>(),
    latestRun: null,
    turnDiffSummaries: [],
    providerStatuses: [],
    runs: [],
    routeThreadKey: "environment-local:thread-1",
    onOpenTurnDiff: () => {},
    onOpenThread: () => {},
    onForkFromRun: async () => {},
    onRollbackCheckpoint: () => {},
    supportsConversationRollback: false,
    onRevertToTurnCount: () => {},
    isRevertingCheckpoint: false,
    openingVideoAttachmentId: null,
    onImageExpand: () => {},
    activeThreadEnvironmentId: ACTIVE_THREAD_ENVIRONMENT_ID,
    markdownCwd: undefined,
    resolvedTheme: "light" as const,
    timestampFormat: "locale" as const,
    workspaceRoot: undefined,
    anchorMessageId: null,
    onAnchorReady: () => {},
    onAnchorSizeChanged: () => {},
    contentInsetEndAdjustment: 0,
    liveFollowEnabled: true,
    onIsAtEndChange: () => {},
    onManualNavigation: () => {},
  };
}

function buildLongUserMessageText(tail = "deep hidden detail only after expand") {
  return Array.from({ length: 9 }, (_, index) =>
    index === 8 ? tail : `Line ${index + 1}: ${"verbose prompt content ".repeat(8).trim()}`,
  ).join("\n");
}

function buildUserTimelineEntry(text: string) {
  return {
    id: "entry-1",
    kind: "message" as const,
    createdAt: MESSAGE_CREATED_AT,
    message: {
      id: MessageId.make("message-1"),
      role: "user" as const,
      text,
      runId: null,
      createdAt: MESSAGE_CREATED_AT,
      updatedAt: MESSAGE_CREATED_AT,
      streaming: false,
    },
  };
}

function buildAssistantTimelineEntry(text: string) {
  const entry = buildUserTimelineEntry(text);
  return {
    ...entry,
    message: {
      ...entry.message,
      role: "assistant" as const,
    },
  };
}

function buildSnapShotTimelineEntry(previewUrl?: string) {
  const entry = buildUserTimelineEntry("First prompt.");
  return {
    ...entry,
    message: {
      ...entry.message,
      attachments: [
        {
          type: "image" as const,
          id: "attachment-1",
          name: "screenshot.png",
          mimeType: "image/png",
          sizeBytes: 1,
          ...(previewUrl ? { previewUrl } : {}),
          source: {
            kind: "snap-shot" as const,
            capturedAt: "2026-03-17T19:12:28.000Z",
            appName: "Terminal",
            windowTitle: "t3code — Tests",
            appIconDataUrl: "data:image/png;base64,aWNvbg==",
          },
        },
      ],
    },
  };
}

describe("MessagesTimeline (t3team)", () => {
  it("shows copy for stored prompts and hides it for triggers", () => {
    const markupFor = (message: Partial<ChatMessage>) => {
      const entry = buildUserTimelineEntry("Review the auth path");
      return renderToStaticMarkup(
        <MessagesTimeline
          {...buildProps()}
          timelineEntries={[{ ...entry, message: { ...entry.message, ...message } }]}
        />,
      );
    };

    expect(markupFor({})).toContain('aria-label="Copy message"');
    expect(
      markupFor({
        createdBy: "agent",
        creationSource: "mcp",
        senderThreadId: ThreadId.make("thread-parent"),
      }),
    ).toContain('aria-label="Copy message"');
    expect(markupFor({ createdBy: "agent", creationSource: "provider" })).not.toContain(
      'aria-label="Copy message"',
    );
    expect(
      markupFor({
        createdBy: "agent",
        creationSource: "server",
        text: "Continue where you left off.",
      }),
    ).not.toContain('aria-label="Copy message"');
    expect(markupFor({ createdBy: "system", creationSource: "server" })).not.toContain(
      'aria-label="Copy message"',
    );
  });
});

describe("MessagesTimeline t3team background bash jobs", () => {
  const bgNow = () => new Date().toISOString();
  const startDetail =
    "Command still running after 10s — it is now a background job: job_a1b2c3d4 (pid 4242). " +
    "It keeps running under a 600s hard deadline owned by this thread; you do not have to wait for it. " +
    'Completion notifies you automatically — do not start a duplicate. Inspect with process({action: "peek", id: "job_a1b2c3d4"}).';

  it("shows the running-job line and tags the originating tool row", () => {
    const createdAt = bgNow();
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        timelineEntries={[
          {
            id: "bg-start-entry",
            kind: "work",
            createdAt,
            entry: {
              id: "bg-start-entry",
              createdAt,
              label: "Run command",
              tone: "tool",
              toolLifecycleStatus: "completed",
              detail: startDetail,
            },
          },
        ]}
      />,
    );
    // Thread-level indicator + the tool-row anchor tag. The per-second age is
    // aria-hidden (own span), so assert the stable text and the age separately.
    expect(markup).toMatch(/1 background job running<\/span>/);
    expect(markup).toMatch(/aria-hidden="true"[^>]*> · 1[01]s<\/span>/);
    expect(markup).toContain("<span>running in background</span>");
    // Regression, thread fbdb583b: the line must sit in the WORKING-ROW slot.
    // `isWorking` is false here — the run that backgrounded the command has
    // already settled — so without the slot the thread read as idle.
    expect(markup).toContain("data-t3team-working-row");
  });

  // Thread fbdb583b: the marker in `command`, no `detail` at all (the runtime
  // sent no structured command, so the host adopted the RESULT as the command).
  it("shows the line for a row persisted before the runtime named its commands", () => {
    const createdAt = bgNow();
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        timelineEntries={[
          {
            id: "bg-legacy-entry",
            kind: "work",
            createdAt,
            entry: {
              id: "bg-legacy-entry",
              createdAt,
              label: "bash",
              tone: "tool",
              itemType: "command_execution",
              toolLifecycleStatus: "completed",
              command:
                "Command still running after 0s — it is now a background job: job_8865dcbe " +
                "(pid 84712). It keeps running under a 1800s hard deadline owned by this " +
                "thread; you do not have to wait...",
            },
          },
        ]}
      />,
    );
    expect(markup).toMatch(/1 background job running<\/span>/);
    expect(markup).toContain("data-t3team-working-row");
    expect(markup).toContain("<span>running in background</span>");
  });

  it("hides the indicator once a process result settles the job", () => {
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        timelineEntries={[
          {
            id: "bg-start-entry",
            kind: "work",
            createdAt: bgNow(),
            entry: {
              id: "bg-start-entry",
              createdAt: bgNow(),
              label: "Run command",
              tone: "tool",
              toolLifecycleStatus: "completed",
              detail: startDetail,
            },
          },
          {
            id: "bg-settle-entry",
            kind: "work",
            createdAt: bgNow(),
            entry: {
              id: "bg-settle-entry",
              createdAt: bgNow(),
              label: "Process tool",
              tone: "tool",
              toolLifecycleStatus: "completed",
              detail: "output…\n[job job_a1b2c3d4 finished]",
            },
          },
        ]}
      />,
    );
    expect(markup).not.toContain("background job running");
    expect(markup).not.toContain("running in background");
    // The row the job kept alive goes with it — no bare separator left over.
    expect(markup).not.toContain("data-t3team-working-row");
  });

  it("stays quiet for a backgrounded job long past its hard deadline", () => {
    const stale = new Date(Date.now() - 700_000).toISOString();
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        timelineEntries={[
          {
            id: "bg-stale-entry",
            kind: "work",
            createdAt: stale,
            entry: {
              id: "bg-stale-entry",
              createdAt: stale,
              label: "Run command",
              tone: "tool",
              toolLifecycleStatus: "completed",
              detail: startDetail,
            },
          },
        ]}
      />,
    );
    expect(markup).not.toContain("background job running");
    expect(markup).not.toContain("running in background");
  });

  // The marker's hard deadline (600s) alone would keep the chip up for a job
  // that started 4m ago — but the job predates the server's current boot, so
  // its process died with the previous one and it must settle now.
  it("settles a background job that started before the server booted", () => {
    const started = new Date(Date.now() - 4 * 60_000).toISOString();
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        t3team={{ serverStartedAtMs: Date.now() - 60_000 }}
        timelineEntries={[
          {
            id: "bg-restart-entry",
            kind: "work",
            createdAt: started,
            entry: {
              id: "bg-restart-entry",
              createdAt: started,
              label: "Run command",
              tone: "tool",
              toolLifecycleStatus: "completed",
              detail: startDetail,
            },
          },
        ]}
      />,
    );
    expect(markup).not.toContain("background job running");
    expect(markup).not.toContain("running in background");
  });

  it("keeps a background job running when it started after the server booted", () => {
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        t3team={{ serverStartedAtMs: Date.now() - 60_000 }}
        timelineEntries={[
          {
            id: "bg-live-entry",
            kind: "work",
            createdAt: bgNow(),
            entry: {
              id: "bg-live-entry",
              createdAt: bgNow(),
              label: "Run command",
              tone: "tool",
              toolLifecycleStatus: "completed",
              detail: startDetail,
            },
          },
        ]}
      />,
    );
    expect(markup).toMatch(/1 background job running<\/span>/);
    expect(markup).toContain("<span>running in background</span>");
  });
});

describe("MessagesTimeline t3team working row (GHE #201/#208/#236)", () => {
  const LEAF_RE = /<span[^>]*class="[^"]*t3team-label-shimmer[^"]*"[^>]*>([^<]*)<\/span>/g;
  const workingProps = () => ({
    ...buildProps(),
    isWorking: true,
    activeTurnInProgress: true,
    activeTurnStartedAt: MESSAGE_CREATED_AT,
    timelineEntries: [],
  });
  const reasoningProps = () => {
    const runId = RunId.make("run-reason");
    return {
      ...workingProps(),
      latestRun: {
        runId,
        status: "running" as const,
        startedAt: MESSAGE_CREATED_AT,
        completedAt: null,
      },
      runningRunId: runId,
      timelineEntries: [
        {
          id: "entry-reason",
          kind: "work" as const,
          createdAt: MESSAGE_CREATED_AT,
          entry: {
            id: "reason-1",
            createdAt: MESSAGE_CREATED_AT,
            runId,
            label: "Thinking",
            tone: "thinking" as const,
            itemType: "reasoning" as const,
            toolLifecycleStatus: "inProgress" as const,
            detail: "weighing the options",
          },
        },
      ],
    };
  };
  const agent = (id: string, title: string) => ({
    id,
    source: "child" as const,
    title,
    statusLabel: "Working",
    activityKey: "k1",
    dotState: "working" as const,
  });

  it("renders exactly ONE live status row: the state word bases it, no duplicate Thinking row", () => {
    const markup = renderToStaticMarkup(
      <MessagesTimeline {...workingProps()} t3team={{ threadActivityState: "thinking" }} />,
    );
    // One live status element per run: the state word is the base of the
    // working row itself — not a second row beneath it.
    expect(markup.split(">Thinking</span>").length - 1).toBe(1);
    expect(markup).not.toContain("live-activity-focus");
    expect(markup).not.toContain('data-timeline-row-kind="thinking"');
  });

  it("says 'Working' on the working row while the native reasoning trace streams (owner dedup)", () => {
    const withState = renderToStaticMarkup(
      <MessagesTimeline {...reasoningProps()} t3team={{ threadActivityState: "thinking" }} />,
    );
    // The native trace keeps the live surface…
    expect(withState).toContain('data-timeline-row-id="live-activity-row"');
    // …and the working row does not say "Thinking" a second time.
    expect(withState).toContain('t3team-aci-lead-word">Working</span>');
    expect(withState).not.toContain('t3team-aci-lead-word">Thinking</span>');
    expect(withState).not.toContain('data-timeline-row-kind="thinking"');

    // Same for the no-state base-word fallback (old servers).
    const withoutState = renderToStaticMarkup(<MessagesTimeline {...reasoningProps()} />);
    expect(withoutState).toContain('t3team-aci-lead-word">Working</span>');
    expect(withoutState).not.toContain('t3team-aci-lead-word">Thinking</span>');
  });

  it("keeps non-thinking state words on the working row while the native reasoning trace streams", () => {
    const markup = renderToStaticMarkup(
      <MessagesTimeline {...reasoningProps()} t3team={{ threadActivityState: "writing" }} />,
    );
    expect(markup).toContain('t3team-aci-lead-word">Writing</span>');
  });

  it("falls back to 'Thinking' for an ACTIVE run with no activity state yet", () => {
    const markup = renderToStaticMarkup(<MessagesTimeline {...workingProps()} />);
    expect(markup).toContain(">Thinking</span>");
    // No second live row of any kind.
    expect(markup).not.toContain("live-activity-focus");
  });

  it("keeps the live working row's lead text in the blue shimmer, not muted grey (regression)", () => {
    const markup = renderToStaticMarkup(<MessagesTimeline {...workingProps()} />);
    // P0: the shimmer class sits on the LEAF text spans, not on a wrapper
    // around the animated flip spans.
    expect(markup).toContain(
      '<span class="t3team-label-shimmer t3team-aci-lead-word">Thinking</span>',
    );
    expect(markup).not.toContain("shimmer-base:var(--muted-foreground)");
  });

  it("renders NO leading dot pulses on the working row — the status text alone leads (regression)", () => {
    const solo = renderToStaticMarkup(<MessagesTimeline {...workingProps()} />);
    expect(solo).not.toContain("dark:bg-[#38bdf8]/60");
    expect(solo).not.toContain("bg-[#0369a1]/60");
    expect(solo).not.toContain("animate-pulse");
    expect(solo).not.toContain("gap-[3px]");
    expect(solo).toContain("Thinking");

    const withAgents = renderToStaticMarkup(
      <MessagesTimeline
        {...workingProps()}
        t3team={{ activeAgents: [agent("agent-dot-qa", "Dot QA")] }}
      />,
    );
    // The child-agent living dots on the right stay, with no leading pulse dots.
    expect(withAgents).toContain('data-t3team-state="working"');
    expect(withAgents).not.toContain("dark:bg-[#38bdf8]/60");
    expect(withAgents).not.toContain("animate-pulse");
  });

  it("centers the status text and the agent dots on one line — no baseline-era nudge (regression)", () => {
    const withAgents = renderToStaticMarkup(
      <MessagesTimeline
        {...workingProps()}
        t3team={{ activeAgents: [agent("agent-dot-align", "Align QA")] }}
      />,
    );
    expect(withAgents).toContain("flex items-center px-1");
    expect(withAgents).not.toContain("-translate-y-[3px]");
  });

  it("gives the state timer a last-resort ellipsis on narrow panels instead of a hard clip (GHE #208 follow-up)", () => {
    const markup = renderToStaticMarkup(
      <MessagesTimeline {...workingProps()} t3team={{ threadActivityState: "thinking" }} />,
    );
    expect(markup).toContain('class="flex min-w-0 items-center"');
    expect(markup).not.toContain("bg-[#0369a1]/60");
    expect(markup).not.toContain("animate-pulse");
    expect(markup).toContain('class="flex min-w-0 items-center overflow-hidden"');
    expect(markup).toContain("t3team-label-shimmer");
  });

  it("paints the working-row shimmer on LEAF text spans, never on a wrapper around the flip spans (P0: invisible text)", () => {
    const markup = renderToStaticMarkup(
      <MessagesTimeline {...workingProps()} t3team={{ threadActivityState: "thinking" }} />,
    );
    const leaves = [...markup.matchAll(LEAF_RE)].map((m) => m[1]);
    expect(leaves).toContain("Thinking");
    expect(leaves).toContain(" for ");
    const wrapper =
      /class="[^"]*t3team-label-shimmer[^"]*"[^>]*>\s*<span[^>]*t3team-aci-flip/.exec(markup) ??
      null;
    expect(wrapper).toBeNull();

    // Fallback path (no start time): the bare "..." string is its own leaf.
    const fallback = renderToStaticMarkup(
      <MessagesTimeline
        {...workingProps()}
        activeTurnStartedAt={null}
        t3team={{ threadActivityState: "thinking" }}
      />,
    );
    expect(fallback).toContain('class="t3team-label-shimmer">Thinking...');
  });

  it("resolves the working-row lead word through the shared resolver: LLM label replaces the state word; active run reads Thinking", () => {
    const withLabel = renderToStaticMarkup(
      <MessagesTimeline
        {...workingProps()}
        t3team={{ threadActivityState: "working", threadActivityLabel: "Editing the retry test" }}
      />,
    );
    const leaves = [...withLabel.matchAll(LEAF_RE)].map((m) => m[1]);
    expect(leaves).toContain("Editing the retry test");
    expect(withLabel).not.toContain(">Working</span>");

    const bare = renderToStaticMarkup(<MessagesTimeline {...workingProps()} />);
    expect(bare).toContain(">Thinking</span>");

    const stateOnly = renderToStaticMarkup(
      <MessagesTimeline {...workingProps()} t3team={{ threadActivityState: "writing" }} />,
    );
    expect(stateOnly).toContain(">Writing</span>");
  });

  it("keeps the lead slot's clamp + per-piece ellipsis in .t3team-aci-lead (GHE #208 follow-up)", () => {
    const css = NodeFS.readFileSync(
      NodeURL.fileURLToPath(
        new NodeURL.URL("../../t3team/t3team-index-aciLead.css", import.meta.url),
      ),
      "utf8",
    );
    const rule = css.match(/\.t3team-aci-lead\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("display: inline-flex");
    expect(rule).toContain("overflow: hidden");
    expect(rule).toContain("white-space: nowrap");
    expect(rule).toContain("transition: width 480ms");
    // No percentage max-width declaration (circular in an auto-basis flex item).
    expect(rule.replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain("max-width:");
    // No JS-measured px width either: the clamp stays owned by CSS.
    expect(css).not.toContain("t3team-aci-lead-sizer");
    const wordRule = css.match(/\.t3team-aci-lead-word\s*\{[^}]*\}/)?.[0] ?? "";
    const timerRule = css.match(/\.t3team-aci-lead-timer\s*\{[^}]*\}/)?.[0] ?? "";
    const joinRule = css.match(/\.t3team-aci-lead-join\s*\{[^}]*\}/)?.[0] ?? "";
    // The duration must survive truncation: the word is the ONLY shrink point.
    expect(wordRule).toContain("min-width: 0");
    expect(wordRule).toContain("text-overflow: ellipsis");
    expect(timerRule).toContain("flex-shrink: 0");
    expect(joinRule).toContain("flex-shrink: 0");
  });

  it("emphasizes the live 'working' state word so it doesn't read like the no-state fallback (GHE #208 follow-up)", () => {
    const live = renderToStaticMarkup(
      <MessagesTimeline {...workingProps()} t3team={{ threadActivityState: "working" }} />,
    );
    expect(live).toContain(
      '<span class="t3team-label-shimmer font-medium t3team-aci-lead-word">Working</span>',
    );

    const fallback = renderToStaticMarkup(<MessagesTimeline {...workingProps()} />);
    expect(fallback).toContain(
      '<span class="t3team-label-shimmer t3team-aci-lead-word">Thinking</span>',
    );
    expect(fallback).not.toContain("font-medium");

    const thinking = renderToStaticMarkup(
      <MessagesTimeline {...workingProps()} t3team={{ threadActivityState: "thinking" }} />,
    );
    expect(thinking).toContain(
      '<span class="t3team-label-shimmer font-medium t3team-aci-lead-word">Thinking</span>',
    );
  });
});
