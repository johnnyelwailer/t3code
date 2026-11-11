import { AuthStandardClientScopes, AuthRelayWriteScope } from "@t3tools/contracts";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentScope } from "~/state/session";

/**
 * Whether this session may spend relay compute (start or cancel a cloud session). `relay:write` is
 * admin-only on purpose; a standard paired session holds `relay:read` and can list, not start.
 * Reads the scopes the way Settings does (`canManageRelay`): the desktop shell is always admin.
 */
export function useCanManageRelay(): boolean {
  const hasRelayWrite = useEnvironmentScope(usePrimaryEnvironmentId(), AuthRelayWriteScope);
  if (typeof window !== "undefined" && window.desktopBridge)
    return AuthStandardClientScopes.includes(AuthRelayWriteScope);
  return hasRelayWrite;
}
