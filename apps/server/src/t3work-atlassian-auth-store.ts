import {
  AtlassianIntegrationProvider,
  type AtlassianAccessibleResource,
  type JiraApiAuth,
  type TokenExchangeResult,
  refreshAccessToken,
} from "@t3tools/integrations-atlassian";
import { MockIntegrationProvider } from "@t3tools/integrations-core/mock";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { fromJsonStringPretty } from "@t3tools/shared/schemaJson";
import { ServerConfig } from "./config.ts";
import { toAtlassianError } from "./t3work-atlassian-http.ts";

export type BasicConnectInput = {
  readonly auth: {
    readonly kind: "basic";
    readonly siteUrl: string;
    readonly email: string;
    readonly apiToken: string;
  };
};

export type OAuthConnectInput = {
  readonly auth: {
    readonly kind: "oauth";
    readonly sites: ReadonlyArray<AtlassianAccessibleResource>;
    readonly token: TokenExchangeResult;
  };
};

type PersistedAtlassianAuths = {
  readonly version: 1;
  readonly auths: ReadonlyArray<{
    readonly accountId: string;
    readonly auth: JiraApiAuth;
  }>;
};

const ATLASSIAN_AUTH_SECRET_NAME = "t3work-atlassian-auths";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const PersistedJiraApiAuth = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("oauth"),
    cloudId: Schema.String,
    accessToken: Schema.String,
    refreshToken: Schema.optional(Schema.String),
    expiresAt: Schema.optional(Schema.Number),
  }),
  Schema.Struct({
    kind: Schema.Literal("basic"),
    siteUrl: Schema.String,
    email: Schema.String,
    apiToken: Schema.String,
  }),
]);
const PersistedAtlassianAuths = Schema.Struct({
  version: Schema.Literal(1),
  auths: Schema.Array(
    Schema.Struct({
      accountId: Schema.String,
      auth: PersistedJiraApiAuth,
    }),
  ),
});
const PersistedAtlassianAuthsJson = fromJsonStringPretty(PersistedAtlassianAuths);
const decodePersistedAtlassianAuths = Schema.decodeEffect(PersistedAtlassianAuthsJson);
const encodePersistedAtlassianAuths = Schema.encodeEffect(PersistedAtlassianAuthsJson);

const mockProvider = new MockIntegrationProvider();
const atlassianAuths = new Map<string, JiraApiAuth>();
const OAUTH_REFRESH_SKEW_MS = 60_000;

function persistedAuthsPayload(): PersistedAtlassianAuths {
  return {
    version: 1,
    auths: [...atlassianAuths].map(([accountId, auth]) => ({ accountId, auth })),
  };
}

const atlassianAuthSecretPath = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const serverConfig = yield* ServerConfig;
  yield* fileSystem
    .makeDirectory(serverConfig.secretsDir, { recursive: true })
    .pipe(Effect.mapError(toAtlassianError("Failed to prepare Atlassian settings directory.")));
  yield* fileSystem
    .chmod(serverConfig.secretsDir, 0o700)
    .pipe(Effect.mapError(toAtlassianError("Failed to secure Atlassian settings directory.")));
  return path.join(serverConfig.secretsDir, `${ATLASSIAN_AUTH_SECRET_NAME}.bin`);
});

export const loadPersistedAuths = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const secretPath = yield* atlassianAuthSecretPath;
  const persisted = yield* fileSystem.readFile(secretPath).pipe(
    Effect.map((bytes) => Uint8Array.from(bytes)),
    Effect.catch((cause) =>
      cause.reason._tag === "NotFound"
        ? Effect.succeed(null)
        : Effect.fail(toAtlassianError("Failed to load persisted Atlassian settings.")(cause)),
    ),
  );
  if (!persisted) return;

  const parsed = yield* decodePersistedAtlassianAuths(textDecoder.decode(persisted)).pipe(
    Effect.mapError(toAtlassianError("Failed to parse persisted Atlassian settings.")),
  );

  for (const entry of parsed.auths) {
    atlassianAuths.set(entry.accountId, entry.auth);
  }
});

export const savePersistedAuths = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const secretPath = yield* atlassianAuthSecretPath;
  const encoded = yield* encodePersistedAtlassianAuths(persistedAuthsPayload()).pipe(
    Effect.mapError(toAtlassianError("Failed to encode Atlassian settings.")),
  );
  const tempPath = `${secretPath}.${globalThis.crypto.randomUUID()}.tmp`;
  yield* Effect.gen(function* () {
    yield* fileSystem.writeFile(tempPath, textEncoder.encode(encoded));
    yield* fileSystem.chmod(tempPath, 0o600);
    yield* fileSystem.rename(tempPath, secretPath);
    yield* fileSystem.chmod(secretPath, 0o600);
  }).pipe(
    Effect.catch((cause) =>
      fileSystem.remove(tempPath).pipe(
        Effect.ignore,
        Effect.flatMap(() =>
          Effect.fail(toAtlassianError("Failed to persist Atlassian settings.")(cause)),
        ),
      ),
    ),
  );
});

function atlassianOAuthClientConfig(): { clientId: string; clientSecret?: string } {
  const clientId =
    process.env.T3WORK_ATLASSIAN_CLIENT_ID?.trim() ??
    process.env.VITE_ATLASSIAN_CLIENT_ID?.trim() ??
    "";
  const clientSecret = process.env.T3WORK_ATLASSIAN_CLIENT_SECRET?.trim();
  return {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
  };
}

function refreshOAuthAuthIfNeeded(accountId: string, auth: JiraApiAuth) {
  return Effect.gen(function* () {
    if (auth.kind !== "oauth" || !auth.refreshToken || !auth.expiresAt) {
      return auth;
    }

    const now = yield* Clock.currentTimeMillis;
    if (auth.expiresAt - now > OAUTH_REFRESH_SKEW_MS) {
      return auth;
    }

    const config = atlassianOAuthClientConfig();
    if (!config.clientId) {
      return auth;
    }

    const token = yield* Effect.tryPromise({
      try: () => refreshAccessToken(config, auth.refreshToken!),
      catch: toAtlassianError("Failed to refresh Atlassian OAuth token."),
    });
    const nextAuth: JiraApiAuth = {
      kind: "oauth",
      cloudId: auth.cloudId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: now + token.expiresIn * 1000,
    };
    atlassianAuths.set(accountId, nextAuth);
    yield* savePersistedAuths;
    return nextAuth;
  });
}

export function providerForAccount(accountId: string) {
  return Effect.gen(function* () {
    yield* loadPersistedAuths;
    const auth = atlassianAuths.get(accountId);
    return auth
      ? new AtlassianIntegrationProvider(yield* refreshOAuthAuthIfNeeded(accountId, auth))
      : mockProvider;
  });
}

export function providerForPersistedAuths() {
  return Effect.gen(function* () {
    yield* loadPersistedAuths;
    const auths = yield* Effect.all(
      [...atlassianAuths].map(([accountId, auth]) => refreshOAuthAuthIfNeeded(accountId, auth)),
    );
    return auths.length > 0 ? AtlassianIntegrationProvider.fromMultipleAuths(auths) : null;
  });
}

export function setAtlassianAuth(accountId: string, auth: JiraApiAuth): void {
  atlassianAuths.set(accountId, auth);
}
