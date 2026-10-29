/**
 * `UserSecretResolver` over a directory the session's trusted host fills at start, the same
 * delivery the broker already uses for session secrets: `grants.json` (a `UserSecretGrantManifest`)
 * and one value file per granted name. The manifest is read once, when the server starts; changing
 * it later grants nothing. Nothing here assumes a user at the keyboard: the same directory can
 * carry an unattended automation's standing grants. Values are read only when injected, and only from a regular file inside
 * the directory, so a link planted there cannot point the injection at another file.
 *
 * `T3CODE_USER_SECRETS_DIR` names the directory. Unset, nothing is granted.
 */
import { UserSecretGrantManifest, type UserSecretGrant } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { checkGrantUse } from "./t3team-userSecretGrants.ts";
import { UserSecretRefused, UserSecretResolver } from "./t3team-UserSecretResolver.ts";

export const USER_SECRET_GRANTS_FILE = "grants.json";

const decodeManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(UserSecretGrantManifest));

const readGrants = Effect.fn("UserSecretResolver.readGrants")(function* (directory: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifestPath = path.join(directory, USER_SECRET_GRANTS_FILE);
  const exists = yield* fileSystem.exists(manifestPath).pipe(Effect.orElseSucceed(() => false));
  if (!exists) return new Map<string, UserSecretGrant>();
  return yield* fileSystem.readFileString(manifestPath).pipe(
    Effect.flatMap(decodeManifest),
    Effect.map((manifest) => new Map(manifest.grants.map((grant) => [grant.name, grant]))),
    Effect.catch((error) =>
      Effect.logWarning("User secret grants could not be read; nothing is granted", {
        errorTag: error._tag,
      }).pipe(Effect.as(new Map<string, UserSecretGrant>())),
    ),
  );
});

export const makeDirectoryResolver = Effect.fn("UserSecretResolver.makeDirectoryResolver")(
  function* (directory: string | undefined) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const grants =
      directory === undefined ? new Map<string, UserSecretGrant>() : yield* readGrants(directory);
    yield* Effect.annotateCurrentSpan({ "user_secret.grant_count": grants.size });

    const readValue = Effect.fn("UserSecretResolver.readValue")(
      function* (name: string) {
        if (directory === undefined) return yield* Effect.fail("no directory");
        const root = yield* fileSystem.realPath(directory);
        const file = path.join(directory, name);
        if ((yield* fileSystem.realPath(file)) !== path.join(root, name)) {
          return yield* Effect.fail("not a file inside the directory");
        }
        if ((yield* fileSystem.stat(file)).type !== "File") return yield* Effect.fail("not a file");
        return Redacted.make(yield* fileSystem.readFileString(file));
      },
      (effect, name) =>
        Effect.mapError(effect, () => new UserSecretRefused({ name, reason: "unavailable" })),
    );

    return UserSecretResolver.of({
      grant: (name) => grants.get(name),
      resolve: Effect.fn("UserSecretResolver.resolve")(function* (input) {
        yield* Effect.annotateCurrentSpan({
          "user_secret.name": input.name,
          "user_secret.mode": input.mode,
        });
        const refusal = checkGrantUse(
          input.name,
          grants.get(input.name),
          input.mode,
          input.destination,
          yield* Clock.currentTimeMillis,
        );
        if (refusal !== undefined) {
          return yield* new UserSecretRefused({ name: input.name, reason: refusal });
        }
        return yield* readValue(input.name);
      }),
    });
  },
);

export const userSecretsDirectory = Config.String("T3CODE_USER_SECRETS_DIR").pipe(
  Config.option,
  Config.map(Option.getOrUndefined),
);
