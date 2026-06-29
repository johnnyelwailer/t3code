import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DraftDocumentReviewQueue } from "~/t3work/t3work-DraftDocumentReviewQueue";
import type { T3WorkDocumentDraftMutation } from "~/t3work/t3work-draftMutationTypes";

const fixtureDrafts: readonly T3WorkDocumentDraftMutation[] = [
  {
    id: "draft-description-alpha-42",
    projectId: "project-alpha",
    createdAt: "2026-06-27T12:00:00.000Z",
    target: {
      provider: "jira",
      issueIdOrKey: "ALPHA-42",
      title: "Stabilize import retries",
    },
    field: "description",
    status: "draft",
    summary: "Agent drafted a runbook-style description with acceptance criteria.",
    currentContent: {
      format: "markdown",
      body: "Retries are flaky and sometimes leave imports pending.\n\nAcceptance criteria TBD.",
    },
    proposedContent: {
      format: "html",
      body: [
        "<h2>Problem</h2>",
        "<p>Imports can stall when the upstream API returns bursty 429s.</p>",
        "<h2>Acceptance Criteria</h2>",
        "<ul><li>Retry attempts use capped exponential backoff.</li>",
        "<li>Operators can see the final failure reason.</li></ul>",
      ].join(""),
    },
  },
  {
    id: "draft-comment-alpha-42",
    projectId: "project-alpha",
    createdAt: "2026-06-27T12:05:00.000Z",
    target: { provider: "jira", issueIdOrKey: "ALPHA-42" },
    field: "comment",
    status: "draft",
    summary: "Agent drafted a concise implementation note for the Jira thread.",
    proposedContent: {
      format: "markdown",
      body: "Proposed next step: ship the backoff guard first, then add metrics once retry volume is visible.",
    },
  },
];

function DraftDocumentReviewStory() {
  const [drafts, setDrafts] = useState(fixtureDrafts);

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Jira document draft review
          </p>
          <h1 className="text-2xl font-semibold">Agent-proposed content changes</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Fixture state for reviewing rich description and comment drafts before Jira write routes
            are connected.
          </p>
        </header>
        <DraftDocumentReviewQueue
          drafts={drafts}
          onApply={(draft) => {
            setDrafts((current) =>
              current.map((candidate) =>
                candidate.id === draft.id ? { ...candidate, status: "applied" } : candidate,
              ),
            );
          }}
          onDiscard={(draft) => {
            setDrafts((current) => current.filter((candidate) => candidate.id !== draft.id));
          }}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "T3work/Draft Document Review",
  component: DraftDocumentReviewStory,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof DraftDocumentReviewStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
