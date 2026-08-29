/**
 * A step row only offers navigation when there is somewhere to go.
 *
 * `describe-rewrite` runs its writer via `thread.askAgent` on the LAUNCH thread, so its step rows carry the
 * current thread's id. From the work item view those rows still opened the same conversation in the side
 * pane — `useOpenSenderThread` refuses it, but only once the user is already on that thread's route, and
 * from the work item view the ids differ.
 *
 * @vitest-environment jsdom
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { T3TeamWorkflowStepDetails } from "~/t3team/chat/t3team-WorkflowStepDetails";
import {
  canOpenStepThread,
  displayedStepStatus,
  fallbackRuntimeLabel,
  StepStatusIcon,
} from "~/t3team/chat/t3team-workflowRunStepRow";
import type { T3TeamWorkflowStepEntry } from "~/t3team/chat/t3team-threadWorkflowStepProgress";

const LAUNCH_THREAD = "thread-launch";
const CHILD_THREAD = "thread-child";

function step(threadId: string | undefined): T3TeamWorkflowStepEntry {
  return {
    stepId: "run-1:3",
    seq: 3,
    stepKind: "thread.turn",
    phase: "completed",
    projectId: "project-1",
    ...(threadId ? { threadId } : {}),
  };
}

describe("canOpenStepThread", () => {
  it("refuses a step that ran on the thread being viewed", () => {
    expect(
      canOpenStepThread({
        step: step(LAUNCH_THREAD),
        currentThreadId: LAUNCH_THREAD,
        hasHandler: true,
      }),
    ).toBe(false);
  });

  it("allows a genuine child thread", () => {
    expect(
      canOpenStepThread({
        step: step(CHILD_THREAD),
        currentThreadId: LAUNCH_THREAD,
        hasHandler: true,
      }),
    ).toBe(true);
  });

  it("refuses when there is no thread or no handler", () => {
    expect(
      canOpenStepThread({
        step: step(undefined),
        currentThreadId: LAUNCH_THREAD,
        hasHandler: true,
      }),
    ).toBe(false);
    expect(
      canOpenStepThread({
        step: step(CHILD_THREAD),
        currentThreadId: LAUNCH_THREAD,
        hasHandler: false,
      }),
    ).toBe(false);
  });

  /** Without a current thread the rule cannot fire; behaviour must fall back to "navigable". */
  it("stays navigable when the current thread is unknown", () => {
    expect(
      canOpenStepThread({ step: step(CHILD_THREAD), currentThreadId: undefined, hasHandler: true }),
    ).toBe(true);
  });
});

describe("T3TeamWorkflowStepDetails", () => {
  it("does not look clickable for a step that ran on this thread", () => {
    const markup = renderToStaticMarkup(
      <T3TeamWorkflowStepDetails
        step={step(LAUNCH_THREAD)}
        currentThreadId={LAUNCH_THREAD}
        onOpenThread={vi.fn()}
      >
        <span>Rewrite NXAI-6</span>
      </T3TeamWorkflowStepDetails>,
    );

    // No button, no chevron, no navigation affordance of any kind.
    expect(markup).not.toContain('aria-label="Open step thread"');
    expect(markup).not.toContain('data-step-row-shell="thread-link"');
    expect(markup).not.toContain("<button");
    // The step is still fully readable.
    expect(markup).toContain("Rewrite NXAI-6");
  });

  it("still offers navigation for a real child thread", () => {
    const markup = renderToStaticMarkup(
      <T3TeamWorkflowStepDetails
        step={step(CHILD_THREAD)}
        currentThreadId={LAUNCH_THREAD}
        onOpenThread={vi.fn()}
      >
        <span>Child work</span>
      </T3TeamWorkflowStepDetails>,
    );

    expect(markup).toContain('aria-label="Open step thread"');
    expect(markup).toContain('data-step-row-shell="thread-link"');
  });
});

/**
 * The `describe-rewrite` residue PJ hit: the body skips its `askUser` when intent was supplied, so the plan
 * row "Rewrite scope ASK" never gets a runtime match — and rendered as a pending circle forever, on a run
 * that had finished two minutes earlier.
 */
describe("displayedStepStatus for a plan row the run never reached", () => {
  it("is pending while the run is still going", () => {
    expect(displayedStepStatus(undefined, "running")).toBe("pending");
    expect(displayedStepStatus(undefined, "suspended")).toBe("pending");
    expect(displayedStepStatus(undefined, undefined)).toBe("pending");
  });

  it("is skipped once the run has settled", () => {
    expect(displayedStepStatus(undefined, "completed")).toBe("skipped");
    expect(displayedStepStatus(undefined, "failed")).toBe("skipped");
    expect(displayedStepStatus(undefined, "cancelled")).toBe("skipped");
  });

  it("renders a skipped row as skipped, not as not-started", () => {
    const markup = renderToStaticMarkup(<StepStatusIcon status="skipped" />);

    expect(markup).toContain('data-step-status="skipped"');
    expect(markup).toContain("skipped — the run did not need this step");
    expect(markup).not.toContain("not started yet");
  });

  /** A step that DID run is unaffected by the run's terminal status. */
  it("leaves an executed step alone", () => {
    expect(
      displayedStepStatus(
        { stepId: "run-1:1", seq: 1, stepKind: "thread.turn", phase: "completed" },
        "completed",
      ),
    ).toBe("completed");
  });
});

/**
 * A dynamic (plan-unmatched) runtime row's label for step kinds the host already knows something
 * useful about — the server sends the real wake time / widget title / message text in `detail`,
 * but the fallback ignored it and showed the same content-free label for every run.
 */
describe("fallbackRuntimeLabel", () => {
  it("shows the real wake time for a wait.until step instead of a content-free label", () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    const label = fallbackRuntimeLabel({
      stepId: "run-1:2",
      seq: 2,
      stepKind: "wait.until",
      phase: "waiting",
      detail: `Sleep until ${future}`,
    });

    expect(label).toMatch(/^Waiting /);
    expect(label).not.toBe("Scheduled work");
  });

  it("falls back to a generic label when a wait.until step has no parseable deadline", () => {
    const label = fallbackRuntimeLabel({
      stepId: "run-1:2",
      seq: 2,
      stepKind: "wait.until",
      phase: "waiting",
    });

    expect(label).toBe("Scheduled work");
  });

  it("shows the widget title / message text for a thread.message step", () => {
    const label = fallbackRuntimeLabel({
      stepId: "run-1:5",
      seq: 5,
      stepKind: "thread.message",
      phase: "completed",
      detail: "add.ts: Option A vs Option B",
    });

    expect(label).toBe("add.ts: Option A vs Option B");
  });

  it("falls back to a generic label for a thread.message step with no detail", () => {
    const label = fallbackRuntimeLabel({
      stepId: "run-1:5",
      seq: 5,
      stepKind: "thread.message",
      phase: "completed",
    });

    expect(label).toBe("Notification sent");
  });
});
