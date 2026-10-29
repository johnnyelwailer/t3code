/** The two RPC bodies a session's card calls on the environment the session runs in. */
import * as Effect from "effect/Effect";

import type { RequestedUserSecrets } from "./t3team-RequestedUserSecrets.ts";

export function makeCredentialRequestsHandlers(store: RequestedUserSecrets["Service"]) {
  return {
    subscribe: (threadId: string) => store.subscribe(threadId),
    revoke: (name: string) => store.revoke(name).pipe(Effect.map((revoked) => ({ revoked }))),
  };
}
