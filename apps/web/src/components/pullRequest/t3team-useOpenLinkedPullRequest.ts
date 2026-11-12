import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { useEffect } from "react";

import { useRightPanelStore } from "~/rightPanelStore";

export interface LinkedPullRequestSelection {
  readonly environmentId: EnvironmentId;
  readonly repository: string;
  readonly number: number;
  readonly projectId: ProjectId;
  readonly host?: string;
}

/**
 * Opens the pull request the URL links to in the panel, once per link. Each open writes the panel
 * store and so re-renders the page, which hands this hook a fresh selection object with the same
 * fields; keying on the fields keeps that render from opening it again, forever.
 */
export function useOpenLinkedPullRequest(input: {
  readonly rightPanelRef: ScopedThreadRef | null;
  readonly supported: boolean;
  readonly linkedSelection: LinkedPullRequestSelection | null;
}) {
  const { rightPanelRef, supported, linkedSelection } = input;
  const environmentId = linkedSelection?.environmentId;
  const repository = linkedSelection?.repository;
  const number = linkedSelection?.number;
  const projectId = linkedSelection?.projectId;
  const host = linkedSelection?.host;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- opens the URL-linked pull request in the right panel store
  useEffect(() => {
    if (!supported || rightPanelRef === null) return;
    if (
      environmentId === undefined ||
      repository === undefined ||
      number === undefined ||
      projectId === undefined
    ) {
      return;
    }
    useRightPanelStore.getState().openPullRequest(rightPanelRef, {
      environmentId,
      repository,
      number,
      projectId,
      ...(host ? { host } : {}),
    });
  }, [supported, rightPanelRef, environmentId, repository, number, projectId, host]);
}
