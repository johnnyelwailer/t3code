/** The two RPC bodies a session's card calls on the environment the session runs in. */
import * as Effect from "effect/Effect";

import type { RequestedUserSecrets } from "./t3team-RequestedUserSecrets.ts";

export function makeCredentialRequestsHandlers(store: RequestedUserSecrets["Service"]) {
  return {
    list: (threadId: string) =>
      Effect.all({ pending: store.pendingFor(threadId), granted: store.list }),
    revoke: (name: string) => store.revoke(name).pipe(Effect.map((revoked) => ({ revoked }))),
  };
}
