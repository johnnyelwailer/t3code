import { useEffect, useState, type ReactNode } from "react";

import { BackendProvider, createT3Backend } from "~/t3team/backend/t3team-index";
import { resolveWsBaseUrl } from "~/t3team/t3team-route-surface-wsUrl";

/**
 * /welcome renders outside the app surface that owns the backend client (T3TeamRouteSurface), so
 * the Jira row had none and its read never answered. Same client, connected while the page shows.
 */
export function NexiWelcomeBackend({ children }: { readonly children: ReactNode }) {
  const [backend] = useState(() => createT3Backend(resolveWsBaseUrl()));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- connects the backend client while the page is shown
  useEffect(() => {
    void backend.connect();
    return () => {
      void backend.disconnect();
    };
  }, [backend]);
  return <BackendProvider backend={backend}>{children}</BackendProvider>;
}
