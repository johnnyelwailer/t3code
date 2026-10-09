import { AuthAdministrativeScopes, AuthRelayWriteScope } from "@t3tools/contracts";

import { usePrimarySessionState } from "~/environments/primary";

/**
 * Whether this session may spend relay compute (start or cancel a cloud session). `relay:write` is
 * admin-only on purpose; a standard paired session holds `relay:read` and can list, not start.
 * Reads the scopes the way Settings does (`canManageRelay`): the desktop shell is always admin.
 */
export function useCanManageRelay(): boolean {
  const primarySessionState = usePrimarySessionState();
  if (typeof window !== "undefined" && window.desktopBridge)
    return AuthAdministrativeScopes.includes(AuthRelayWriteScope);
  const data = primarySessionState.data;
  return data?.authenticated ? (data.scopes?.includes(AuthRelayWriteScope) ?? false) : false;
}
