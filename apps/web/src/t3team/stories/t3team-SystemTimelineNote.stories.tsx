import type { Meta, StoryObj } from "@storybook/react";
import { MessageId } from "@t3tools/contracts";

import type { ChatMessage } from "~/types";
import { T3TeamSystemTimelineRow } from "~/t3team/chat/t3team-SystemTimelineRow";

function note(id: string, text: string, ext?: ChatMessage["t3teamExt"]): ChatMessage {
  return {
    id: MessageId.make(id),
    role: "system",
    text,
    streaming: false,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    runId: null,
    ...(ext === undefined ? {} : { t3teamExt: ext }),
  };
}

function Row({ message }: { readonly message: ChatMessage }) {
  return (
    <div className="max-w-3xl">
      <T3TeamSystemTimelineRow
        message={message}
        threadRef={null}
        activeWorkflowInputMessageId={null}
      />
    </div>
  );
}

const meta = {
  title: "T3Team/Timeline/System Note",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** A one-line note the host recorded: quiet text, no labelled System card. */
export const BareNote: Story = {
  render: () => <Row message={note("note-bare", "Plan: machine-setup")} />,
};

/** A workflow's `notifyUser` note, with its ext: the same quiet text. */
export const WorkflowNotification: Story = {
  render: () => (
    <Row
      message={note(
        "note-workflow",
        "Skipped machine setup: the task only edits docs. Run /machine-setup when the work needs the project's toolchain.",
        {
          author: { kind: "system", workflowRunId: "run-1" },
          visibleToUser: true,
          visibleToAgent: false,
        },
      )}
    />
  ),
};

/** A long note collapses behind the same expand button as a long user message. */
export const LongNote: Story = {
  render: () => (
    <Row
      message={note(
        "note-long",
        Array.from({ length: 12 }, (_, index) => `Detail ${index + 1}: what the run did.`).join(
          "\n",
        ),
      )}
    />
  ),
};

/** A note that carries a resource attachment still gets the labelled System card. */
export const NoteWithAttachment: Story = {
  render: () => (
    <Row
      message={note("note-attachment", "Attachments ready", {
        visibleToUser: true,
        attachments: [
          {
            kind: "resource",
            resource: {
              provider: "atlassian",
              kind: "ticket",
              id: "resource-1",
              displayId: "PROJ-123",
              title: "Fix import crash",
              status: "In Progress",
            },
          },
        ],
      })}
    />
  ),
};
