/**
 * The thread-workflow actions for a thread on ANY environment, not just this app's primary server.
 *
 * `createT3Backend` talks to the primary server with the primary's own credential. A cloud
 * session, SSH or WSL environment is a different server: its decision-card answer must go to THAT
 * server (the workflow, and its pending ask, live there) and carry THAT connection's credential.
 * Both come from the environment's prepared connection, read at call time so a reconnect's new
 * URL or bearer is used.
 */
import type { PreparedConnection } from "@t3tools/client-runtime/connection";

import { createThreadWorkflowApi, type ThreadWorkflowApi } from "./t3team-threadWorkflowApi";
import type { BackendAuthInit } from "./t3team-t3BackendHttp";

export type EnvironmentHttpConnection = Pick<
  PreparedConnection,
  "httpBaseUrl" | "httpAuthorization"
>;

/**
 * Bearer connections send their token (and no cookies); a connection with no credential relies on
 * the environment's session cookie, which a cross-origin request only carries when credentialed.
 * A DPoP (T3 Connect) credential needs a per-request signed proof that this plain `fetch` path
 * cannot make, so it fails loudly instead of sending an unauthenticated request.
 */
export async function environmentAuthInit(
  authorization: EnvironmentHttpConnection["httpAuthorization"],
): Promise<BackendAuthInit> {
  if (authorization === null) return { credentials: "include", headers: {} };
  if (authorization._tag === "Bearer") {
    return { credentials: "omit", headers: { authorization: `Bearer ${authorization.token}` } };
  }
  throw new Error("This environment's relay sign-in cannot answer workflow cards from here yet.");
}

export function createEnvironmentWorkflowBackend(input: {
  readonly resolveConnection: () => EnvironmentHttpConnection | null;
}): ThreadWorkflowApi {
  return createThreadWorkflowApi(() => {
    const connection = input.resolveConnection();
    if (connection === null) {
      throw new Error("Not connected to this environment.");
    }
    return {
      httpBaseUrl: connection.httpBaseUrl,
      auth: () => environmentAuthInit(connection.httpAuthorization),
    };
  });
}
