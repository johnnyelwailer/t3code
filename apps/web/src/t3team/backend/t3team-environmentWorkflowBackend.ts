/**
 * The thread-workflow actions for a thread on ANY environment, not just this app's primary server.
 *
 * `createT3Backend` talks to the primary server with the primary's own credential. A cloud
 * session, SSH, WSL or T3 Connect environment is a different server: a decision-card answer must
 * go to THAT server (the workflow, and its pending ask, live there) and carry THAT connection's
 * credential. The prepared connection is read per call, so a reconnect's new URL or token is used,
 * and the request is authenticated by the client runtime's environment HTTP auth (bearer, or a
 * signed and renewable DPoP proof), the same as every other request to that environment.
 */
import type { PreparedConnection } from "@t3tools/client-runtime/connection";
import {
  postEnvironmentJson,
  type EnvironmentJsonPostResponse,
} from "@t3tools/client-runtime/state/environment-json-post";
import {
  createRuntimeCommand,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";

import { connectionAtomRuntime } from "~/connection/runtime";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { readPreparedConnection } from "~/state/session";
import {
  EnvironmentNotConnectedError,
  toEnvironmentRequestError,
} from "./t3team-environmentTransientError";
import { BackendApiError } from "./t3team-t3BackendHttp";
import { createThreadWorkflowApi, type ThreadWorkflowApi } from "./t3team-threadWorkflowApi";

const environmentJsonPost = createRuntimeCommand(connectionAtomRuntime, {
  label: "t3team:environment-json-post",
  execute: (input: {
    readonly prepared: PreparedConnection;
    readonly path: string;
    readonly body: unknown;
  }) => postEnvironmentJson(input),
});

/** Same outcome shape as `postJson`: the route's own `error`/`code` on a non-2xx reply. */
function unwrapResponse<TResponse>(path: string, response: EnvironmentJsonPostResponse): TResponse {
  const payload = (response.payload ?? null) as { error?: unknown; code?: unknown } | null;
  if (response.status < 200 || response.status >= 300) {
    throw new BackendApiError(
      typeof payload?.error === "string"
        ? payload.error
        : `Request to ${path} failed with ${response.status}`,
      typeof payload?.code === "string" ? payload.code : undefined,
    );
  }
  if (payload === null) throw new Error("Empty response from backend.");
  return payload as TResponse;
}

export function createEnvironmentWorkflowBackend(environmentId: EnvironmentId): ThreadWorkflowApi {
  return createThreadWorkflowApi(async (path, body) => {
    const prepared = readPreparedConnection(environmentId);
    if (prepared === null) throw new EnvironmentNotConnectedError();
    const result = await runAtomCommand(
      appAtomRegistry,
      environmentJsonPost,
      { prepared, path, body },
      { label: "t3team:environment-json-post", reportFailure: false },
    );
    if (result._tag === "Failure") {
      throw toEnvironmentRequestError(squashAtomCommandFailure(result));
    }
    return unwrapResponse(path, result.value);
  });
}
