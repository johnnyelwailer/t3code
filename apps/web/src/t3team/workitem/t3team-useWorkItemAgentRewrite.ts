/**
 * Controller for the description section's "Rewrite with agent" control.
 *
 * The agent never writes the description directly — it always proposes through
 * `t3team.work_item.description.draft_update`, and a human accepts the draft in the existing review
 * UI (`WorkItemDescriptionDraftDiff`). This hook only starts the turn that asks for that proposal:
 *
 * - If the work item's aside is already showing a thread, the turn is started on THAT thread
 *   (`sendT3TeamThreadTurn`) — the draft lands there via the existing hidden-attachment pipe, and the
 *   reviewer is looking at the thread that produced it.
 * - Otherwise a ticket kickoff thread is created with the rewrite instruction as its kickoff message,
 *   reusing the same `onKickoffThread` callback the kickoff composer itself calls — never a second
 *   thread-creation path.
 *
 * Starting a turn on a thread that already has one in progress is rejected by the server; that
 * rejection is surfaced here rather than swallowed; see `deliverDraftFeedbackToSourceThread` for the
 * sibling case (routing feedback back to a thread) that established this must never fail silently.
 */

import { useCallback, useState } from "react";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { sendT3TeamThreadTurn } from "~/t3team/chat/t3team-sendThreadTurn";
import {
  toUserFacingError,
  type T3TeamUserFacingError,
} from "~/t3team/components/error/t3team-errorMessage";
import { createDefaultT3TeamKickoffLaunchConfig } from "~/t3team/t3team-kickoffLaunchConfig";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { TicketKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import { buildWorkItemAgentRewritePrompt } from "~/t3team/workitem/t3team-workItemAgentRewritePrompt";

const THREAD_BUSY_FRAGMENT = "already has a turn in progress";

function isThreadBusyError(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  return message.includes(THREAD_BUSY_FRAGMENT);
}

export type UseWorkItemAgentRewriteInput = {
  readonly backend: BackendApi | null | undefined;
  readonly projectId: string;
  readonly ticketId: string;
  /** The issue key both the prompt and the draft tool target — `model.key`, not the raw ticket id. */
  readonly issueIdOrKey: string;
  /** `ProjectThread.ticketDisplayId`'s value for a freshly created kickoff thread. */
  readonly ticketDisplayId: string;
  readonly descriptionText?: string | undefined;
  readonly summary?: string | undefined;
  readonly githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  /** The thread id the work item's aside is currently showing, if any. */
  readonly activeThreadId?: string | undefined;
  readonly onKickoffThread: (input: TicketKickoffThreadInput) => void;
  /** From `useWorkItemDrafts` — not re-derived here. */
  readonly hasPendingDescriptionDraft: boolean;
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
    descriptionText,
    summary,
    githubActivityItems,
    activeThreadId,
    onKickoffThread,
    hasPendingDescriptionDraft,
  } = input;
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<T3TeamUserFacingError | null>(null);

  const start = useCallback(() => {
    const prompt = buildWorkItemAgentRewritePrompt({ issueIdOrKey, descriptionText, summary });

    if (activeThreadId) {
      if (!backend) {
        setError(toUserFacingError(new Error("The app is not connected to a server."), {
          action: "start the rewrite",
        }));
        return;
      }
      setIsStarting(true);
      setError(null);
      void sendT3TeamThreadTurn({ backend, threadId: activeThreadId, text: prompt })
        .then(() => setIsStarting(false))
        .catch((cause: unknown) => {
          setIsStarting(false);
          setError(
            isThreadBusyError(cause)
              ? {
                  headline: "This thread is still finishing a turn.",
                  detail: "Wait for it to finish, then try again.",
                  canRetry: true,
                }
              : toUserFacingError(cause, { action: "start the rewrite" }),
          );
        });
      return;
    }

    const launchConfig = createDefaultT3TeamKickoffLaunchConfig();
    onKickoffThread({
      projectId,
      ticketId,
      ticketDisplayId,
      githubActivityItems,
      kickoffMessage: prompt,
      kickoffPending: true,
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
    issueIdOrKey,
    onKickoffThread,
    projectId,
    summary,
    ticketDisplayId,
    ticketId,
  ]);

  return { start, isStarting, error, isDisabled: isStarting || hasPendingDescriptionDraft };
}
