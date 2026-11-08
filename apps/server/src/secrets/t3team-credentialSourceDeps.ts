/** Wires `CredentialSources` to this server's GitHub transport and process environment. */
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as GitHubRest from "@t3tools/source-control-github/server/GitHubRest";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import type { CredentialSourcesDeps } from "./t3team-CredentialSources.ts";

export const credentialSourceDeps = Effect.gen(function* () {
  const github = yield* GitHubRest.GitHubRest;
  const environment = yield* HostProcess.Environment;
  return {
    environment,
    rest: (input) =>
      github.rest({ host: input.host, operation: input.operation, path: input.path }),
    credential: (host) =>
      github
        .credential(host, { personal: true })
        .pipe(Effect.map((credential) => Redacted.make(Redacted.value(credential.token)))),
  } satisfies CredentialSourcesDeps;
});
