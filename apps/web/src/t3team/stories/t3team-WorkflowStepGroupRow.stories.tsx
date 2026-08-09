import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import { T3TeamWorkflowStepGroupRow } from "~/t3team/chat/t3team-WorkflowStepGroupRow";
import { buildT3TeamWorkflowStepGroups } from "~/t3team/chat/t3team-workflowMessageGroups";

const LABEL = "Rewrite the description of NXAI-6";

const PROMPT_TEXT =
  "Before writing, READ the work item for context: the parent epic, its children, comments and links. " +
  "Then reply with the rewritten description and NOTHING else — no preamble, no explanation.";

function workflowMessages() {
  return [
    { id: "prompt", role: "user", t3teamExt: { author: author() } },
    { id: "a1", role: "assistant", t3teamExt: { author: author() } },
    { id: "a2", role: "assistant", t3teamExt: { author: author() } },
    { id: "a3", role: "assistant", t3teamExt: { author: author() } },
  ];
}

function author() {
  return { kind: "workflow", workflowRunId: "run-1", stepId: "corr-42", label: LABEL } as const;
}

const GROUP = buildT3TeamWorkflowStepGroups(workflowMessages())[0]!;

/** The user bubble, for contrast — this is the styling machine traffic used to wear. */
function UserBubble({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div
        className="relative max-w-[80%] rounded-2xl bg-accent p-3 text-sm"
        data-user-message-body="true"
      >
        {children}
      </div>
    </div>
  );
}

function Frame({ children }: { readonly children: React.ReactNode }) {
  return <div className="max-w-2xl space-y-3">{children}</div>;
}

const meta = {
  title: "T3Team/Workflow Step Group Row",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** Collapsed by default: the step's label and how much traffic it holds. */
export const Collapsed: Story = {
  render: () => (
    <Frame>
      <T3TeamWorkflowStepGroupRow group={GROUP} expanded={false} onToggle={() => {}} />
    </Frame>
  ),
};

/** Expanded — the transcript is one click away, never hidden. */
export const Expanded: Story = {
  render: () => {
    const [expanded, setExpanded] = useState(true);
    return (
      <Frame>
        <T3TeamWorkflowStepGroupRow
          group={GROUP}
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
        />
        {expanded ? (
          <div className="space-y-2 border-l-2 border-border/60 pl-3">
            <p className="text-sm leading-6 text-muted-foreground">{PROMPT_TEXT}</p>
            <p className="text-sm leading-6 text-foreground/90">
              Als Entwickler brauche ich eine klare Rollendefinition…
            </p>
          </div>
        ) : null}
      </Frame>
    );
  },
};

/**
 * The comparison PJ is judging: the same nine-paragraph machine prompt as a quiet step row versus wearing his
 * own message styling.
 */
export const BeforeAndAfter: Story = {
  render: () => (
    <Frame>
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/65">
        Now — attributed to the workflow
      </p>
      <T3TeamWorkflowStepGroupRow group={GROUP} expanded={false} onToggle={() => {}} />

      <p className="pt-3 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/65">
        Before — wearing the user's bubble
      </p>
      <UserBubble>{PROMPT_TEXT}</UserBubble>

      <p className="pt-3 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/65">
        A real human message, unchanged either way
      </p>
      <UserBubble>Please add acceptance criteria.</UserBubble>
    </Frame>
  ),
};
