/**
 * The credential sources on the machine the user is sitting at, for a request raised by a session
 * running elsewhere. `probe` reports what exists and shows no value; `read` is the one call that
 * returns a value, made after the user picked that source. Dependencies are plain functions so the
 * module is host-neutral: the server wires `GitHubRest` and the process environment in.
 */
import {
  CredentialSourcesError,
  type CredentialSource,
  type CredentialSourcesProbeInput,
  type CredentialSourcesProbeResult,
  type CredentialSourcesReadInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { grantedScopes, missingScopes, refreshCommand } from "./t3team-credentialScopes.ts";
import { expectedShape, looksLikeAnotherSecret } from "./t3team-credentialShape.ts";

/** Whatever went wrong reaching a source; callers only learn that it is unavailable. */
export interface SourceFailure {
  readonly message: string;
}

export interface CredentialSourcesDeps {
  readonly environment: Readonly<Record<string, string | undefined>>;
  /** A GET against the host's API with the user's own credential for it. */
  readonly rest: (input: {
    readonly host: string;
    readonly operation: string;
    readonly path: string;
  }) => Effect.Effect<
    { readonly headers: Readonly<Record<string, string | undefined>>; readonly body: string },
    SourceFailure
  >;
  readonly credential: (host: string) => Effect.Effect<Redacted.Redacted<string>, SourceFailure>;
}

const decodeViewer = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ login: Schema.String })),
);

const envValue = (deps: CredentialSourcesDeps, name: string | undefined) => {
  const value = name === undefined ? undefined : deps.environment[name]?.trim();
  return value === undefined || value === "" ? undefined : value;
};

export function makeCredentialSources(deps: CredentialSourcesDeps) {
  const ghSource = (host: string, requested: ReadonlyArray<string>) =>
    deps.rest({ host, operation: "CredentialSources.probe", path: "/user" }).pipe(
      Effect.map((response): CredentialSource | undefined => {
        const viewer = decodeViewer(response.body);
        if (Option.isNone(viewer)) return undefined;
        const granted = grantedScopes(response.headers["x-oauth-scopes"]);
        const missing = missingScopes(granted, requested);
        return {
          kind: "gh",
          host,
          account: viewer.value.login,
          scopeCheck:
            requested.length === 0
              ? "ok"
              : granted === undefined
                ? "unknown"
                : missing.length === 0
                  ? "ok"
                  : "missing",
          missingScopes: missing,
          ...(missing.length === 0 ? {} : { refreshCommand: refreshCommand(host, missing) }),
        };
      }),
      Effect.orElseSucceed(() => undefined),
    );

  const probe = Effect.fn("CredentialSources.probe")(function* (
    input: CredentialSourcesProbeInput,
  ): Effect.fn.Return<CredentialSourcesProbeResult> {
    const sources: CredentialSource[] = [];
    if (input.host !== undefined) {
      const gh = yield* ghSource(input.host, input.scopes ?? []);
      if (gh !== undefined) sources.push(gh);
    }
    const value = envValue(deps, input.name);
    if (input.name !== undefined && value !== undefined) {
      sources.push({
        kind: "env",
        name: input.name,
        ...(looksLikeAnotherSecret(value, expectedShape(input.host, input.name))
          ? { warning: "different_secret_type" as const }
          : {}),
      });
    }
    sources.push({ kind: "manual" });
    return { sources };
  });

  const read = Effect.fn("CredentialSources.read")(function* (input: CredentialSourcesReadInput) {
    if (input.source === "gh") {
      if (input.host === undefined)
        return yield* new CredentialSourcesError({ reason: "invalid_request" });
      const token = yield* deps
        .credential(input.host)
        .pipe(Effect.mapError(() => new CredentialSourcesError({ reason: "not_available" })));
      return { value: Redacted.value(token) };
    }
    if (input.name === undefined)
      return yield* new CredentialSourcesError({ reason: "invalid_request" });
    const value = envValue(deps, input.name);
    if (value === undefined) return yield* new CredentialSourcesError({ reason: "not_available" });
    return { value };
  });

  return { probe, read };
}

export type CredentialSources = ReturnType<typeof makeCredentialSources>;
