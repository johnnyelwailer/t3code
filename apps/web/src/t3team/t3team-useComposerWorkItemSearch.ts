import { useEffect, useRef, useState } from "react";

import {
  searchComposerWorkItems,
  type ComposerWorkItem,
} from "./t3team-composerReferenceRecency";

/**
 * Live work-item search for the composer's issue menu (U2). Runs a fresh Atlassian backlog search
 * whenever the settled query changes; the request-id guard drops stale in-flight responses.
 */
export interface ComposerWorkItemSearchState {
  readonly data: { readonly items: ReadonlyArray<ComposerWorkItem> } | null;
  readonly error: string | null;
  readonly isPending: boolean;
}

export function useComposerWorkItemSearch(input: {
  readonly httpBaseUrl: string | null;
  readonly enabled: boolean;
  readonly query: string | null;
  readonly account: { readonly id: string; readonly provider: string } | null;
  readonly externalProjectId: string | null;
  readonly jiraProjectKey?: string | undefined;
  readonly threadId: string | null;
  readonly limit?: number | undefined;
}): ComposerWorkItemSearchState {
  const [state, setState] = useState<ComposerWorkItemSearchState>({
    data: null,
    error: null,
    isPending: false,
  });
  const requestIdRef = useRef(0);
  const {
    httpBaseUrl,
    enabled,
    query,
    account,
    externalProjectId,
    jiraProjectKey,
    threadId,
    limit,
  } = input;
  const accountId = account?.id;
  const accountProvider = account?.provider;

  useEffect(() => {
    if (
      enabled === false ||
      httpBaseUrl === null ||
      query === null ||
      account === null ||
      externalProjectId === null ||
      threadId === null
    ) {
      setState({ data: null, error: null, isPending: false });
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((current) => ({ ...current, isPending: true, error: null }));
    void searchComposerWorkItems(httpBaseUrl, {
      account,
      externalProjectId,
      ...(jiraProjectKey !== undefined ? { jiraProjectKey } : {}),
      query,
      threadId,
      ...(limit !== undefined ? { limit } : {}),
    })
      .then((items) => {
        if (requestIdRef.current !== requestId) return;
        setState({ data: { items }, error: null, isPending: false });
      })
      .catch((error: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setState({
          data: null,
          error: error instanceof Error ? error.message : "Work items could not be read.",
          isPending: false,
        });
      });
  }, [
    enabled,
    httpBaseUrl,
    query,
    accountId,
    accountProvider,
    externalProjectId,
    jiraProjectKey,
    threadId,
    limit,
  ]);

  return state;
}
