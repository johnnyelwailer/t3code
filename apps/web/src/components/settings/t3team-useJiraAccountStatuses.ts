import { useCallback, useEffect, useRef, useState } from "react";

import type { AtlassianAccountStatus } from "~/t3team/backend/t3team-atlassianAccountStatus";
import { useBackend } from "~/t3team/backend/t3team-index";

export type JiraAccountStatusesState =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly accounts: ReadonlyArray<AtlassianAccountStatus> };

export function useJiraAccountStatuses() {
  const backend = useBackend();
  const [state, setState] = useState<JiraAccountStatusesState>({ kind: "loading" });
  const unmountedRef = useRef(false);

  const reload = useCallback(() => {
    if (!backend) return;
    backend.atlassian
      .listAccountStatuses()
      .then((accounts) => {
        if (!unmountedRef.current) setState({ kind: "ready", accounts });
      })
      .catch(() => {
        if (!unmountedRef.current) setState({ kind: "error" });
      });
  }, [backend]);

  useEffect(() => {
    unmountedRef.current = false;
    reload();
    return () => {
      unmountedRef.current = true;
    };
  }, [reload]);

  const disconnect = useCallback(
    async (accountId: string) => {
      await backend?.atlassian.disconnectAccount(accountId);
      reload();
    },
    [backend, reload],
  );
  return { state, reload, disconnect };
}
