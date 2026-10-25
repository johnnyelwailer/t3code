import type { HostServiceContext } from "@t3team/pack-api";
import { AuthStandardClientScopes } from "@t3tools/contracts";
import { resolveFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import { Accounts } from "./account/t3team-Accounts.ts";
import { EnvironmentAuth, type IssuedBearerSession } from "./auth/EnvironmentAuth.ts";
import { ServerConfig } from "./config.ts";

export const makeHostServiceContext = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const auth = yield* EnvironmentAuth;
  const accounts = yield* Accounts;
  const scope = yield* Effect.scope;
  return Effect.fn("hostServices.context")(function* (id: string, port: number) {
    const lock = yield* Semaphore.make(1);
    let session: IssuedBearerSession | undefined;
    const localToken = lock
      .withPermits(1)(
        Effect.gen(function* () {
          if (!session) {
            session = yield* auth.issueSession({
              ttl: Duration.days(365),
              label: id,
              scopes: AuthStandardClientScopes,
            });
            const issued = session;
            yield* Effect.addFinalizer(() =>
              auth.revokeSession(issued.sessionId).pipe(Effect.ignore),
            );
          }
          return session.token;
        }),
      )
      .pipe(Effect.provideService(Scope.Scope, scope));
    return {
      stateDirectory: config.stateDir,
      localOrigin: `http://127.0.0.1:${port}`,
      localAccessToken: () => Effect.runPromise(localToken),
      accessToken: (account, resource, options) =>
        Effect.runPromise(accounts.accessToken(account, resource, options)),
      featureEnabled: (key) => resolveFeatureFlag(key)?.enabled ?? false,
      log: (event, fields) => {
        Effect.runSync(Effect.logInfo(event, fields));
      },
    } satisfies HostServiceContext;
  });
});
