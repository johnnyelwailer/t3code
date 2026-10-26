import { EnvironmentId, MessageId, RunId, ThreadId } from "@t3tools/contracts";
import type { LegendListRef } from "@legendapp/list/react";
import { act, createRef, type ComponentProps, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import "~/index.css";

import type { ChatMessage } from "../../types";
import { MessagesTimeline } from "./MessagesTimeline";

type TimelineProps = ComponentProps<typeof MessagesTimeline>;

const MESSAGE_CREATED_AT = "2026-03-17T19:12:28.000Z";
const ACTIVE_THREAD_ENVIRONMENT_ID = EnvironmentId.make("environment-local");

// The timeline remembers scroll position and open disclosures per thread key,
// so every render gets a fresh thread.
let threadCount = 0;

function baseProps() {
  threadCount += 1;
  return {
    isWorking: false,
    activeTurnInProgress: false,
    listRef: createRef<LegendListRef | null>(),
    latestRun: null,
    turnDiffSummaries: [],
    runs: [],
    routeThreadKey: `environment-local:t3team-thread-${threadCount}`,
    onOpenTurnDiff: () => {},
    onOpenThread: () => {},
    onForkFromRun: async () => {},
    onRollbackCheckpoint: () => {},
    supportsConversationRollback: false,
    onRevertToTurnCount: () => {},
    isRevertingCheckpoint: false,
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
    emptyPlaceholderInset: 0,
    liveFollowEnabled: true,
    onIsAtEndChange: () => {},
    onManualNavigation: () => {},
  } satisfies Omit<TimelineProps, "timelineEntries">;
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

const roots: Root[] = [];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function renderMarkup(element: ReactElement) {
  const container = document.body.appendChild(document.createElement("div"));
  container.style.cssText = "height: 1200px; width: 900px; display: flex; flex-direction: column;";
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(element));
  return container.innerHTML;
}

describe("MessagesTimeline t3team copy control", () => {
  it("shows copy for stored prompts and hides it for triggers", async () => {
    const markupFor = async (message: Partial<ChatMessage>) => {
      const entry = buildUserTimelineEntry("Review the auth path");
      return await renderMarkup(
        <MessagesTimeline
          {...baseProps()}
          timelineEntries={[{ ...entry, message: { ...entry.message, ...message } }]}
        />,
      );
    };

    expect(await markupFor({})).toContain('aria-label="Copy message"');
    // Upstream folds another agent's message to one line; its footer (and copy) shows once the
    // fold is expanded, so the folded row renders no copy control.
    expect(
      await markupFor({
        createdBy: "agent",
        creationSource: "mcp",
        senderThreadId: ThreadId.make("thread-parent"),
      }),
    ).not.toContain('aria-label="Copy message"');
    expect(await markupFor({ createdBy: "agent", creationSource: "provider" })).not.toContain(
      'aria-label="Copy message"',
    );
    expect(
      await markupFor({
        createdBy: "agent",
        creationSource: "server",
        text: "Continue where you left off.",
      }),
    ).not.toContain('aria-label="Copy message"');
    expect(await markupFor({ createdBy: "system", creationSource: "server" })).not.toContain(
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

  it("shows the running-job line and tags the originating tool row", async () => {
    const createdAt = bgNow();
    const markup = await renderMarkup(
      <MessagesTimeline
        {...baseProps()}
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
  it("shows the line for a row persisted before the runtime named its commands", async () => {
    const createdAt = bgNow();
    const markup = await renderMarkup(
      <MessagesTimeline
        {...baseProps()}
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

  it("hides the indicator once a process result settles the job", async () => {
    const markup = await renderMarkup(
      <MessagesTimeline
        {...baseProps()}
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

  it("stays quiet for a backgrounded job long past its hard deadline", async () => {
    const stale = new Date(Date.now() - 700_000).toISOString();
    const markup = await renderMarkup(
      <MessagesTimeline
        {...baseProps()}
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
  it("settles a background job that started before the server booted", async () => {
    const started = new Date(Date.now() - 4 * 60_000).toISOString();
    const markup = await renderMarkup(
      <MessagesTimeline
        {...baseProps()}
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

  it("keeps a background job running when it started after the server booted", async () => {
    const markup = await renderMarkup(
      <MessagesTimeline
        {...baseProps()}
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
    ...baseProps(),
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

  it("renders exactly ONE live status row: the state word bases it, no duplicate Thinking row", async () => {
    const markup = await renderMarkup(
      <MessagesTimeline {...workingProps()} t3team={{ threadActivityState: "thinking" }} />,
    );
    // One live status element per run: the state word is the base of the
    // working row itself — not a second row beneath it.
    expect(markup.split(">Thinking</span>").length - 1).toBe(1);
    expect(markup).not.toContain("live-activity-focus");
    expect(markup).not.toContain('data-timeline-row-kind="thinking"');
  });

  it("says 'Working' on the working row while the native reasoning trace streams (owner dedup)", async () => {
    const withState = await renderMarkup(
      <MessagesTimeline {...reasoningProps()} t3team={{ threadActivityState: "thinking" }} />,
    );
    // The native trace keeps the live surface…
    expect(withState).toContain('data-timeline-row-id="live-activity-row"');
    // …and the working row does not say "Thinking" a second time.
    expect(withState).toContain('t3team-aci-lead-word">Working</span>');
    expect(withState).not.toContain('t3team-aci-lead-word">Thinking</span>');
    expect(withState).not.toContain('data-timeline-row-kind="thinking"');

    // Same for the no-state base-word fallback (old servers).
    const withoutState = await renderMarkup(<MessagesTimeline {...reasoningProps()} />);
    expect(withoutState).toContain('t3team-aci-lead-word">Working</span>');
    expect(withoutState).not.toContain('t3team-aci-lead-word">Thinking</span>');
  });

  it("keeps non-thinking state words on the working row while the native reasoning trace streams", async () => {
    const markup = await renderMarkup(
      <MessagesTimeline {...reasoningProps()} t3team={{ threadActivityState: "writing" }} />,
    );
    expect(markup).toContain('t3team-aci-lead-word">Writing</span>');
  });

  it("falls back to 'Thinking' for an ACTIVE run with no activity state yet", async () => {
    const markup = await renderMarkup(<MessagesTimeline {...workingProps()} />);
    expect(markup).toContain(">Thinking</span>");
    // No second live row of any kind.
    expect(markup).not.toContain("live-activity-focus");
  });

  it("keeps the live working row's lead text in the blue shimmer, not muted grey (regression)", async () => {
    const markup = await renderMarkup(<MessagesTimeline {...workingProps()} />);
    // P0: the shimmer class sits on the LEAF text spans, not on a wrapper
    // around the animated flip spans.
    expect(markup).toContain(
      '<span class="t3team-label-shimmer t3team-aci-lead-word">Thinking</span>',
    );
    expect(markup).not.toContain("shimmer-base:var(--muted-foreground)");
  });

  it("renders NO leading dot pulses on the working row — the status text alone leads (regression)", async () => {
    const solo = await renderMarkup(<MessagesTimeline {...workingProps()} />);
    expect(solo).not.toContain("dark:bg-[#38bdf8]/60");
    expect(solo).not.toContain("bg-[#0369a1]/60");
    expect(solo).not.toContain("animate-pulse");
    expect(solo).not.toContain("gap-[3px]");
    expect(solo).toContain("Thinking");

    const withAgents = await renderMarkup(
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

  it("centers the status text and the agent dots on one line — no baseline-era nudge (regression)", async () => {
    const withAgents = await renderMarkup(
      <MessagesTimeline
        {...workingProps()}
        t3team={{ activeAgents: [agent("agent-dot-align", "Align QA")] }}
      />,
    );
    expect(withAgents).toContain("flex items-center px-1");
    expect(withAgents).not.toContain("-translate-y-[3px]");
  });

  // Live report (cloud, 2026-10-26): the agent ended its turn on "the child will wake me", and the
  // thread read as finished — chips alone, then nothing — until the completion wake resumed it.
  it("says what an ended turn still waits for, and that the agent resumes once it finished", async () => {
    const idle = { ...baseProps(), timelineEntries: [] };
    const settled = {
      ...agent("agent:triage", "Triage open issues"),
      dotState: "settled" as const,
    };

    const waiting = await renderMarkup(
      <MessagesTimeline {...idle} t3team={{ activeAgents: [agent("child:t", "Triage")] }} />,
    );
    expect(waiting).toContain(">Waiting for Triage</span>");

    const resuming = await renderMarkup(
      <MessagesTimeline {...idle} t3team={{ activeAgents: [settled] }} />,
    );
    expect(resuming).toContain(">Triage open issues finished · resuming</span>");
    expect(resuming).toContain('data-t3team-state="settled"');

    // The wake turn is running: the delivered task is no longer an agent of this row.
    const resumed = await renderMarkup(
      <MessagesTimeline {...workingProps()} t3team={{ activeAgents: [settled] }} />,
    );
    expect(resumed).not.toContain('data-t3team-state="settled"');
    expect(resumed).not.toContain("finished · resuming");
  });

  it("gives the state timer a last-resort ellipsis on narrow panels instead of a hard clip (GHE #208 follow-up)", async () => {
    const markup = await renderMarkup(
      <MessagesTimeline {...workingProps()} t3team={{ threadActivityState: "thinking" }} />,
    );
    expect(markup).toContain('class="flex min-w-0 items-center"');
    expect(markup).not.toContain("bg-[#0369a1]/60");
    expect(markup).not.toContain("animate-pulse");
    expect(markup).toContain('class="flex min-w-0 items-center overflow-hidden"');
    expect(markup).toContain("t3team-label-shimmer");
  });

  it("paints the working-row shimmer on LEAF text spans, never on a wrapper around the flip spans (P0: invisible text)", async () => {
    const markup = await renderMarkup(
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
    const fallback = await renderMarkup(
      <MessagesTimeline
        {...workingProps()}
        activeTurnStartedAt={null}
        t3team={{ threadActivityState: "thinking" }}
      />,
    );
    expect(fallback).toContain('class="t3team-label-shimmer">Thinking...');
  });

  it("resolves the working-row lead word through the shared resolver: LLM label replaces the state word; active run reads Thinking", async () => {
    const withLabel = await renderMarkup(
      <MessagesTimeline
        {...workingProps()}
        t3team={{ threadActivityState: "working", threadActivityLabel: "Editing the retry test" }}
      />,
    );
    const leaves = [...withLabel.matchAll(LEAF_RE)].map((m) => m[1]);
    expect(leaves).toContain("Editing the retry test");
    expect(withLabel).not.toContain(">Working</span>");

    const bare = await renderMarkup(<MessagesTimeline {...workingProps()} />);
    expect(bare).toContain(">Thinking</span>");

    const stateOnly = await renderMarkup(
      <MessagesTimeline {...workingProps()} t3team={{ threadActivityState: "writing" }} />,
    );
    expect(stateOnly).toContain(">Writing</span>");
  });

  it("emphasizes the live 'working' state word so it doesn't read like the no-state fallback (GHE #208 follow-up)", async () => {
    const live = await renderMarkup(
      <MessagesTimeline {...workingProps()} t3team={{ threadActivityState: "working" }} />,
    );
    expect(live).toContain(
      '<span class="t3team-label-shimmer font-medium t3team-aci-lead-word">Working</span>',
    );

    const fallback = await renderMarkup(<MessagesTimeline {...workingProps()} />);
    expect(fallback).toContain(
      '<span class="t3team-label-shimmer t3team-aci-lead-word">Thinking</span>',
    );
    expect(fallback).not.toContain("font-medium");

    const thinking = await renderMarkup(
      <MessagesTimeline {...workingProps()} t3team={{ threadActivityState: "thinking" }} />,
    );
    expect(thinking).toContain(
      '<span class="t3team-label-shimmer font-medium t3team-aci-lead-word">Thinking</span>',
    );
  });
});
