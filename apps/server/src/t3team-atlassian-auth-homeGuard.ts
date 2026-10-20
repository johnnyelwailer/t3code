// @effect-diagnostics nodeBuiltinImport:off - hashing the secrets directory path needs node:crypto and node:path.
import * as NodeCrypto from "node:crypto";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import * as HostProcess from "@t3tools/shared/HostProcess";

import { ServerConfig } from "./config.ts";

/**
 * Which installation a persisted Atlassian secret belongs to.
 *
 * Atlassian refresh tokens are single-use and rotate on every refresh. The cross-process lock only
 * protects servers that share one secrets directory. A copy of the secret in another directory (a
 * QA server on a copied profile, a restored backup, a second T3 home) is invisible to that lock: the
 * first time the copy refreshes, it rotates the token away from the real installation, whose next
 * refresh fails with `unauthorized_client` / "refresh_token is invalid" and the user is asked to
 * sign in again. That repeats every hour while the copy runs.
 *
 * So the secret records a home id: a hash of the secrets directory it was written for (never a
 * token). A server only redeems the refresh token when the id matches its own directory. A copy
 * keeps using the access token it has, but never rotates the shared refresh token. Signing in on
 * the copy writes a fresh secret with that copy's own id.
 */
let secretHomeId: string | undefined;

export function atlassianHomeIdForSecretsDir(
  secretsDir: string,
  platform: NodeJS.Platform = "linux",
): string {
  let resolved = NodePath.resolve(secretsDir);
  // Case-insensitive filesystems: the same directory must hash to the same id.
  if (platform === "win32" || platform === "darwin") resolved = resolved.toLowerCase();
  return NodeCrypto.createHash("sha256").update(resolved).digest("hex").slice(0, 32);
}

export const currentAtlassianHomeId = Effect.gen(function* () {
  const { secretsDir } = yield* ServerConfig;
  const platform = yield* HostProcess.Platform;
  return atlassianHomeIdForSecretsDir(secretsDir, platform);
});

/** After a reload: the id stored in the file, or undefined for a file written before ids existed. */
export function setLoadedSecretHomeId(homeId: string | undefined): void {
  secretHomeId = homeId;
}

/** After a fresh sign-in (or a clear), the secret belongs to this installation. */
export function claimSecretForThisHome(): void {
  secretHomeId = undefined;
}

/** The id to write: a foreign id is preserved so a copy never launders itself by saving. */
export const homeIdToPersist = Effect.map(currentAtlassianHomeId, (mine) => secretHomeId ?? mine);

/** True when this server may redeem the refresh token (legacy files without an id are adopted). */
export const secretBelongsToThisHome = Effect.map(
  currentAtlassianHomeId,
  (mine) => secretHomeId === undefined || secretHomeId === mine,
);
