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
import { canOpenStepThread } from "~/t3team/chat/t3team-workflowRunStepRow";
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
      canOpenStepThread({ step: step(undefined), currentThreadId: LAUNCH_THREAD, hasHandler: true }),
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
