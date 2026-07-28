/**
 * Machine traffic must stop reading as chat, without becoming invisible.
 *
 * @vitest-environment jsdom
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  buildT3TeamWorkflowStepGroups,
  placeT3TeamWorkflowMessage,
  readT3TeamWorkflowAuthor,
} from "~/t3team/chat/t3team-workflowMessageGroups";
import { T3TeamWorkflowStepGroupRow } from "~/t3team/chat/t3team-WorkflowStepGroupRow";

const STEP = "corr-42";
const LABEL = "Rewrite the description of NXAI-6";

function workflowMessage(id: string, stepId = STEP) {
  return {
    id,
    role: "user",
    t3teamExt: {
      author: { kind: "workflow", workflowRunId: "run-1", stepId, label: LABEL },
    },
  };
}

function assistantWorkflowMessage(id: string, stepId = STEP) {
  return { ...workflowMessage(id, stepId), role: "assistant" };
}

/** The trap: the completion card is `role:"assistant"` and carries NO workflow author. */
const COMPLETION_CARD = {
  id: "completion",
  role: "assistant",
  t3teamExt: {
    attachments: [{ kind: "work-item-draft", projectId: "p", issueIdOrKey: "NXAI-6" }],
  },
};

const HUMAN = { id: "human", role: "user" };
/** Rehydrated-after-restart steps stamp no author — documented degradation. */
const UNATTRIBUTED_ASSISTANT = { id: "rehydrated", role: "assistant" };

describe("readT3TeamWorkflowAuthor", () => {
  it("reads only the workflow variant", () => {
    expect(readT3TeamWorkflowAuthor(workflowMessage("m1"))?.stepId).toBe(STEP);
    expect(readT3TeamWorkflowAuthor(HUMAN)).toBeUndefined();
    expect(readT3TeamWorkflowAuthor(COMPLETION_CARD)).toBeUndefined();
    expect(
      readT3TeamWorkflowAuthor({ id: "s", t3teamExt: { author: { kind: "system" } } }),
    ).toBeUndefined();
  });
});

describe("buildT3TeamWorkflowStepGroups", () => {
  it("groups the prompt and all its replies into one step", () => {
    const groups = buildT3TeamWorkflowStepGroups([
      HUMAN,
      workflowMessage("prompt"),
      assistantWorkflowMessage("preamble"),
      assistantWorkflowMessage("narration"),
      assistantWorkflowMessage("answer"),
      COMPLETION_CARD,
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe(LABEL);
    expect(groups[0]?.messageIds).toEqual(["prompt", "preamble", "narration", "answer"]);
  });

  it("keeps separate steps separate, in first-appearance order", () => {
    const groups = buildT3TeamWorkflowStepGroups([
      workflowMessage("p2", "corr-2"),
      workflowMessage("p1", "corr-1"),
      assistantWorkflowMessage("a2", "corr-2"),
    ]);

    expect(groups.map((group) => group.stepId)).toEqual(["corr-2", "corr-1"]);
    expect(groups[0]?.messageIds).toEqual(["p2", "a2"]);
  });

  it("groups a step whose messages are interrupted by a system notice", () => {
    const groups = buildT3TeamWorkflowStepGroups([
      workflowMessage("prompt"),
      { id: "notice", role: "system", t3teamExt: { author: { kind: "system" } } },
      assistantWorkflowMessage("answer"),
    ]);

    expect(groups[0]?.messageIds).toEqual(["prompt", "answer"]);
  });

  it("finds no groups in an ordinary conversation", () => {
    expect(buildT3TeamWorkflowStepGroups([HUMAN, UNATTRIBUTED_ASSISTANT, COMPLETION_CARD])).toEqual(
      [],
    );
  });
});

describe("placeT3TeamWorkflowMessage", () => {
  const messages = [
    HUMAN,
    workflowMessage("prompt"),
    assistantWorkflowMessage("answer"),
    COMPLETION_CARD,
    UNATTRIBUTED_ASSISTANT,
  ];
  const groups = buildT3TeamWorkflowStepGroups(messages);

  it("anchors the collapsed row on the step's first message", () => {
    expect(placeT3TeamWorkflowMessage("prompt", groups).kind).toBe("anchor");
  });

  it("makes every later message of the step a member", () => {
    expect(placeT3TeamWorkflowMessage("answer", groups).kind).toBe("member");
  });

  /** The one that matters: swallowing this card would hide the draft the user must click. */
  it("leaves the completion card alone", () => {
    expect(placeT3TeamWorkflowMessage("completion", groups).kind).toBe("none");
  });

  it("leaves a human message and an unattributed assistant message alone", () => {
    expect(placeT3TeamWorkflowMessage("human", groups).kind).toBe("none");
    expect(placeT3TeamWorkflowMessage("rehydrated", groups).kind).toBe("none");
  });
});

describe("T3TeamWorkflowStepGroupRow", () => {
  const group = buildT3TeamWorkflowStepGroups([
    workflowMessage("prompt"),
    assistantWorkflowMessage("a1"),
    assistantWorkflowMessage("a2"),
    assistantWorkflowMessage("a3"),
  ])[0]!;

  it("summarises the step with its label and message count, collapsed", () => {
    const markup = renderToStaticMarkup(
      <T3TeamWorkflowStepGroupRow group={group} expanded={false} onToggle={vi.fn()} />,
    );

    expect(markup).toContain(LABEL);
    expect(markup).toContain("4 messages");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('data-workflow-step-group="corr-42"');
    // Never the user's bubble — that styling is what made machine instructions read as PJ's own words.
    expect(markup).not.toContain("bg-accent");
    expect(markup).not.toContain("data-user-message-body");
  });

  it("reports itself expanded when it is", () => {
    const markup = renderToStaticMarkup(
      <T3TeamWorkflowStepGroupRow group={group} expanded onToggle={vi.fn()} />,
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('data-workflow-step-expanded="true"');
  });

  it("says 'message' for a single-message step", () => {
    const single = buildT3TeamWorkflowStepGroups([workflowMessage("only")])[0]!;
    const markup = renderToStaticMarkup(
      <T3TeamWorkflowStepGroupRow group={single} expanded={false} onToggle={vi.fn()} />,
    );

    expect(markup).toContain("1 message");
    expect(markup).not.toContain("1 messages");
  });
});
