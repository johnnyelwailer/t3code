import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import { useT3TeamStagedComposerActionStore } from "~/t3team/t3team-stagedComposerActionStore";
import { T3TeamDiffCommentThread } from "~/t3team/workitem/t3team-WorkItemDiffCommentUi";
import { WorkItemAgentRewriteControl } from "~/t3team/workitem/t3team-WorkItemAgentRewriteControl";
import {
  useWorkItemAgentRewrite,
  type UseWorkItemAgentRewriteInput,
} from "~/t3team/workitem/t3team-useWorkItemAgentRewrite";

const BASE_PROPS: UseWorkItemAgentRewriteInput = {
  projectId: "project-1",
  ticketId: "KOOR-1",
  issueIdOrKey: "KOOR-1",
  projectWorkspaceRoot: "/tmp/project-koor",
  descriptionText: "The camera resets to the default angle after a session reload.",
  summary: "Camera resets on reload",
  hasPendingDescriptionDraft: false,
  hasLoadedWorkItem: true,
};

const TARGET = { projectId: BASE_PROPS.projectId, ticketId: BASE_PROPS.ticketId };

/** Every story starts from an empty staging store, so opening one story does not leave a preselected
 * action behind for the next. */
function useFreshStagingStore() {
  useEffect(() => {
    useT3TeamStagedComposerActionStore.setState({ byKey: {} });
    return () => useT3TeamStagedComposerActionStore.setState({ byKey: {} });
  }, []);
}

/** Drives the control to the state a story wants to show, so the viewer lands on it rather than
 * having to click first. Nothing here reaches a server — the whole point of the control is that the
 * click is pure client state. */
const NO_NOTES: ReadonlyArray<string> = [];

function Staged({
  notes = NO_NOTES,
  ...props
}: UseWorkItemAgentRewriteInput & { readonly notes?: ReadonlyArray<string> }) {
  useFreshStagingStore();
  const rewrite = useWorkItemAgentRewrite(props);

  useEffect(() => {
    rewrite.open();
    for (const note of notes) rewrite.submitComment(note);
    // Runs once, on mount, to reach the demonstrated state immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <WorkItemAgentRewriteControl {...props} />;
}

/** Mirrors what the aside's composer shows for the staged notes, so the story documents the whole
 * interaction and not just its trigger. */
function StagedComposerPreview() {
  const staged = useT3TeamStagedComposerActionStore((state) => state.byKey["project-1:KOOR-1"]);
  const removeComment = useT3TeamStagedComposerActionStore((state) => state.removeComment);
  if (!staged) return null;

  return (
    <div className="mt-6 max-w-sm rounded-lg border border-border bg-card p-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
        On the composer
      </p>
      <p className="text-sm font-medium text-foreground">{staged.selectedRecipe.recipe.title}</p>
      <T3TeamDiffCommentThread
        comments={staged.comments}
        onRemove={(commentId) => removeComment(TARGET, commentId)}
      />
    </div>
  );
}

const meta = {
  title: "T3Team/Work Item Agent Rewrite Control",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  render: () => <WorkItemAgentRewriteControl {...BASE_PROPS} />,
};

/**
 * What a click produces: the note popout, immediately. It is the same card the diff reviewer gets on
 * a text selection, anchored to the button because this note is about the whole field.
 */
export const PopoutOpen: Story = {
  render: () => (
    <div className="flex justify-end pb-56">
      <Staged {...BASE_PROPS} />
    </div>
  ),
};

/** Notes accumulate; they do not replace one another, and each keeps its own remove control. */
export const TwoNotesAttached: Story = {
  render: () => (
    <div>
      <div className="flex justify-end">
        <Staged
          {...BASE_PROPS}
          notes={["Lead with the user impact.", "Drop the changelog section."]}
        />
      </div>
      <StagedComposerPreview />
    </div>
  ),
};

export const DisabledDraftPending: Story = {
  render: () => <WorkItemAgentRewriteControl {...BASE_PROPS} hasPendingDescriptionDraft />,
};

/** The work item itself hasn't loaded (or failed to) — disabled rather than preselecting a workflow
 * built from empty data. */
export const DisabledNotLoaded: Story = {
  render: () => <WorkItemAgentRewriteControl {...BASE_PROPS} hasLoadedWorkItem={false} />,
};

/** No local workspace ⇒ no `.t3team/recipes/describe-rewrite` on disk. The control refuses rather
 * than preselecting a run whose draft-tool call could not resolve. */
export const ErrorNoWorkspace: Story = {
  render: () => {
    const { projectWorkspaceRoot: _omitted, ...props } = BASE_PROPS;
    return (
      <div className="flex justify-end">
        <Staged {...props} />
      </div>
    );
  },
};
