/**
 * Controller for the description section's `Rewrite` control.
 *
 * Clicking it launches the bundled `describe-rewrite` RECIPE WORKFLOW — it does not start an agent
 * turn. That is the whole point of this path: the workflow opens with a deterministic `askUser`
 * card, so a click costs nothing until the human has said what should change. The writer turn runs
 * afterwards, and the workflow BODY calls `t3team.work_item.description.draft_update`, so "exactly
 * one draft, always reviewed" is a property of the engine rather than of prompt obedience.
 *
 * Two launch shapes, one workflow:
 *
 * - The aside is already showing a thread ⇒ one step: `launchRecipeWorkflow` on that thread id.
 *   The launch route rejects an empty `threadId`, so this is only available once a thread exists.
 * - No thread yet ⇒ two steps, and the second one has to survive a navigation. The kickoff
 *   NAVIGATES to the new thread and unmounts this component, so the launch cannot be awaited here.
 *   Rather than inventing a parallel "do it once the thread is ready" mechanism, the kickoff
 *   carries the workflow as `kickoffWorkflow`: `runThreadBootstrapKickoff` already branches on a
 *   kickoff that has a `workflowPath` and calls `launchRecipeWorkflow` INSTEAD of
 *   `thread.turn.start`. That branch is what makes the no-thread case honour the no-model-first
 *   invariant, and it is the same path every Quick Start recipe launch takes.
 *
 * Failures are surfaced, never swallowed — see `deliverDraftFeedbackToSourceThread` for the
 * sibling case that established that. The kickoff path reports nothing back (`onKickoffThread`
 * returns void and navigates synchronously), so a one-way `kickoffLaunched` latch closes the
 * double-click window instead; it never un-latches because the navigation unmounts this component.
 */

import { useCallback, useState } from "react";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { T3TeamUserFacingError } from "~/t3team/components/error/t3team-errorMessage";
import { createDefaultT3TeamKickoffLaunchConfig } from "~/t3team/t3team-kickoffLaunchConfig";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { TicketKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import {
  toWorkItemRewriteLaunchError,
  workItemRewriteDisconnectedError,
  workItemRewriteMissingWorkspaceError,
} from "~/t3team/workitem/t3team-workItemRewriteLaunchErrors";
import {
  buildWorkItemRewriteKickoffMessage,
  buildWorkItemRewriteWorkflow,
  launchWorkItemRewriteOnThread,
} from "~/t3team/workitem/t3team-workItemRewriteWorkflowLaunch";

export type UseWorkItemAgentRewriteInput = {
  readonly backend: BackendApi | null | undefined;
  readonly projectId: string;
  readonly ticketId: string;
  /** The issue key both the workflow input and the draft tool target — `model.key`, not the raw
   * ticket id. */
  readonly issueIdOrKey: string;
  /** `ProjectThread.ticketDisplayId`'s value for a freshly created kickoff thread. */
  readonly ticketDisplayId: string;
  /** Where `.t3team/recipes/describe-rewrite` lives. Without it there is no recipe to launch. */
  readonly projectWorkspaceRoot?: string | undefined;
  readonly descriptionText?: string | undefined;
  readonly summary?: string | undefined;
  readonly githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  /** The thread id the work item's aside is currently showing, if any. */
  readonly activeThreadId?: string | undefined;
  readonly onKickoffThread: (input: TicketKickoffThreadInput) => void;
  /** From `useWorkItemDrafts` — not re-derived here. */
  readonly hasPendingDescriptionDraft: boolean;
  /** Whether the work item's own data (ticket or snapshot) has actually loaded. A workflow started
   * on nothing — no description, no real summary — is worse than no control at all, so the caller
   * gates this rather than the control silently launching on empty data. */
  readonly hasLoadedWorkItem: boolean;
};

export function useWorkItemAgentRewrite(input: UseWorkItemAgentRewriteInput): {
  readonly start: () => void;
  readonly isStarting: boolean;
  readonly error: T3TeamUserFacingError | null;
  readonly isDisabled: boolean;
} {
  const {
    backend,
    projectId,
    ticketId,
    issueIdOrKey,
    ticketDisplayId,
    projectWorkspaceRoot,
    descriptionText,
    summary,
    githubActivityItems,
    activeThreadId,
    onKickoffThread,
    hasPendingDescriptionDraft,
    hasLoadedWorkItem,
  } = input;
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<T3TeamUserFacingError | null>(null);
  const [kickoffLaunched, setKickoffLaunched] = useState(false);

  const start = useCallback(() => {
    // Re-entrancy guard: `isDisabled` already keeps the button from being clicked twice, but `start`
    // is also called directly in tests/stories, and defending it here means the latch holds even if
    // a future caller renders its own trigger without wiring `isDisabled` through.
    if (isStarting || kickoffLaunched || hasPendingDescriptionDraft || !hasLoadedWorkItem) return;

    const workflow = buildWorkItemRewriteWorkflow({
      issueIdOrKey,
      ...(summary ? { summary } : {}),
      ...(descriptionText ? { currentBody: descriptionText } : {}),
      ...(projectWorkspaceRoot ? { projectWorkspaceRoot } : {}),
    });
    if (!workflow) {
      setError(workItemRewriteMissingWorkspaceError());
      return;
    }
    const kickoffMessage = buildWorkItemRewriteKickoffMessage(issueIdOrKey);
    const launchConfig = createDefaultT3TeamKickoffLaunchConfig();

    if (activeThreadId) {
      if (!backend) {
        setError(workItemRewriteDisconnectedError());
        return;
      }
      setIsStarting(true);
      setError(null);
      void launchWorkItemRewriteOnThread({
        backend,
        threadId: activeThreadId,
        workflow,
        launchConfig,
        kickoffMessage,
      })
        .then(() => setIsStarting(false))
        .catch((cause: unknown) => {
          setIsStarting(false);
          setError(toWorkItemRewriteLaunchError(cause));
        });
      return;
    }

    // Latched before calling out: `onKickoffThread` navigates synchronously but reports nothing
    // back, so this is the only signal that stops a second click from creating a second kickoff
    // thread for the same ticket.
    setKickoffLaunched(true);
    onKickoffThread({
      projectId,
      ticketId,
      ticketDisplayId,
      githubActivityItems,
      // Not a prompt: the bootstrap needs a non-empty initial message to plan a kickoff at all, and
      // routes it to the workflow launch (not a turn) because `kickoffWorkflow` has a workflowPath.
      kickoffMessage,
      kickoffPending: true,
      kickoffWorkflow: workflow,
      kickoffModelSelection: launchConfig.selection,
      kickoffRuntimeMode: launchConfig.runtimeMode,
      kickoffInteractionMode: launchConfig.interactionMode,
      selectedToolIds: launchConfig.selectedToolIds,
      kickoffContextAttachments: [],
    });
  }, [
    activeThreadId,
    backend,
    descriptionText,
    githubActivityItems,
    hasLoadedWorkItem,
    hasPendingDescriptionDraft,
    issueIdOrKey,
    kickoffLaunched,
    isStarting,
    onKickoffThread,
    projectId,
    projectWorkspaceRoot,
    summary,
    ticketDisplayId,
    ticketId,
  ]);

  return {
    start,
    isStarting,
    error,
    isDisabled: isStarting || hasPendingDescriptionDraft || kickoffLaunched || !hasLoadedWorkItem,
  };
}
