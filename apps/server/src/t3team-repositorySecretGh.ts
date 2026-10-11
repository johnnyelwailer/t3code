/**
 * List and set GitHub/GHE Actions repository secrets via `gh`, with the secret value only on stdin.
 *
 * @module t3team-repositorySecretGh
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as GitHubCli from "./sourceControl/GitHubCli.ts";

const SecretNameRow = Schema.Struct({ name: Schema.String });
const SecretNameList = Schema.Array(SecretNameRow);
const decodeNames = Schema.decodeUnknownEffect(SecretNameList);

export type RepositorySecretWriteFailure =
  | { readonly kind: "permission_denied"; readonly detail: string }
  | { readonly kind: "failed"; readonly detail: string };

/** Upper-case Actions secret names currently on the repository (`gh secret list`). */
export const listRepositorySecretNames = Effect.fn("listRepositorySecretNames")(function* (input: {
  readonly cwd: string;
  readonly host: string;
  readonly repository: string;
}) {
  const github = yield* GitHubCli.GitHubCli;
  const listed = yield* github
    .execute({
      cwd: input.cwd,
      args: [
        "secret",
        "list",
        "--hostname",
        input.host,
        "--repo",
        input.repository,
        "--json",
        "name",
      ],
      timeoutMs: 30_000,
    })
    .pipe(
      Effect.mapError((error): RepositorySecretWriteFailure => ({
        kind: "failed",
        detail: error.message,
      })),
    );
  const rows = yield* decodeNames(JSON.parse(listed.stdout || "[]")).pipe(
    Effect.mapError((): RepositorySecretWriteFailure => ({
      kind: "failed",
      detail: "Could not read the repository's secret names from gh.",
    })),
  );
  return rows.map((row) => row.name);
});

/** Writes one Actions secret; value is piped on stdin and never appears in argv. */
export const setRepositorySecretValue = Effect.fn("setRepositorySecretValue")(function* (input: {
  readonly cwd: string;
  readonly host: string;
  readonly repository: string;
  readonly name: string;
  readonly value: string;
}) {
  const github = yield* GitHubCli.GitHubCli;
  const result = yield* github
    .execute({
      cwd: input.cwd,
      args: [
        "secret",
        "set",
        input.name,
        "--hostname",
        input.host,
        "--repo",
        input.repository,
        "--body",
        "-",
      ],
      stdin: input.value,
      timeoutMs: 60_000,
    })
    .pipe(Effect.result);
  if (result._tag === "Success") return;
  const error = result.failure;
  const causeText =
    error.cause !== undefined && typeof error.cause === "object" && error.cause !== null
      ? [
          "message" in error.cause
            ? String((error.cause as { message?: unknown }).message ?? "")
            : "",
          "stderr" in error.cause ? String((error.cause as { stderr?: unknown }).stderr ?? "") : "",
          "stdout" in error.cause ? String((error.cause as { stdout?: unknown }).stdout ?? "") : "",
        ].join("\n")
      : "";
  const detail = [error.message, causeText].filter((part) => part.trim().length > 0).join("\n");
  const denied =
    error._tag === "GitHubCliAuthenticationError" ||
    /403|must have admin|not have permission|resource not accessible|HTTP 403/i.test(detail);
  return yield* Effect.fail(
    denied
      ? ({ kind: "permission_denied", detail } satisfies RepositorySecretWriteFailure)
      : ({ kind: "failed", detail } satisfies RepositorySecretWriteFailure),
  );
});
