/**
 * Prompt for a repository Actions secret (agent-blind) and write it with `gh secret set` via stdin.
 *
 * @module t3team-repositorySecretPublisher
 */
import type { ProjectId, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { isRepositorySecretSetEnabled } from "./t3team-repositorySecretFlag.ts";
import {
  listRepositorySecretNames,
  setRepositorySecretValue,
} from "./t3team-repositorySecretGh.ts";
import { promptRepositorySecret } from "./t3team-repositorySecretPrompt.ts";
import { resolveRepositorySecretRemote } from "./t3team-repositorySecretRemote.ts";

const SECRET_NAME = /^(?!GITHUB_)[A-Z_][A-Z0-9_]*$/;

export type RepositorySecretSetStatus =
  | "saved"
  | "declined"
  | "permission_denied"
  | "already_present"
  | "unavailable";

export type RepositorySecretSetResult = {
  readonly status: RepositorySecretSetStatus;
  readonly name: string;
  readonly detail?: string;
};

export type RepositorySecretSetInput = {
  readonly cwd: string;
  readonly projectId: ProjectId;
  readonly threadId: ThreadId;
  readonly name: string;
  readonly label: string;
  readonly reason: string;
  readonly placeholder?: string;
  readonly timeoutMs?: number;
  readonly clientRequestId?: string;
};

export class T3TeamRepositorySecretPublisher extends Context.Service<
  T3TeamRepositorySecretPublisher,
  {
    readonly set: (input: RepositorySecretSetInput) => Effect.Effect<RepositorySecretSetResult>;
  }
>()("t3/t3team-repositorySecretPublisher/T3TeamRepositorySecretPublisher") {}

const make = Effect.gen(function* () {
  const set = Effect.fn("T3TeamRepositorySecretPublisher.set")(function* (
    input: RepositorySecretSetInput,
  ) {
    const name = input.name.trim();
    if (!SECRET_NAME.test(name)) {
      return {
        status: "unavailable" as const,
        name,
        detail: "Secret name must be an upper-case identifier and must not start with GITHUB_.",
      };
    }
    if (!isRepositorySecretSetEnabled()) {
      return {
        status: "unavailable" as const,
        name,
        detail:
          "Repository secret set is turned off (feature flag REPOSITORY_SECRET_SET). Set the secret in the repository's Actions settings.",
      };
    }

    const remote = yield* resolveRepositorySecretRemote(input.cwd).pipe(Effect.result);
    if (remote._tag === "Failure") {
      return { status: "unavailable" as const, name, detail: remote.failure };
    }

    const listed = yield* listRepositorySecretNames({
      cwd: input.cwd,
      host: remote.success.host,
      repository: remote.success.repository,
    }).pipe(Effect.result);
    if (listed._tag === "Failure") {
      return {
        status: "unavailable" as const,
        name,
        detail: listed.failure.detail,
      };
    }
    if (listed.success.includes(name)) {
      return { status: "already_present" as const, name };
    }

    const prompted = yield* promptRepositorySecret({
      threadId: input.threadId,
      projectId: input.projectId,
      label: input.label.trim() || name,
      reason: input.reason.trim() || `Set repository Actions secret ${name}.`,
      ...(input.placeholder === undefined ? {} : { placeholder: input.placeholder }),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      ...(input.clientRequestId === undefined ? {} : { clientRequestId: input.clientRequestId }),
    });
    if (prompted.status !== "saved") {
      const status =
        prompted.status === "declined"
          ? ("declined" as const)
          : prompted.status === "unavailable"
            ? ("unavailable" as const)
            : ("declined" as const);
      return { status, name, detail: prompted.detail };
    }

    const written = yield* setRepositorySecretValue({
      cwd: input.cwd,
      host: remote.success.host,
      repository: remote.success.repository,
      name,
      value: prompted.value,
    }).pipe(Effect.result);
    if (written._tag === "Failure") {
      return {
        status:
          written.failure.kind === "permission_denied"
            ? ("permission_denied" as const)
            : ("unavailable" as const),
        name,
        detail: written.failure.detail,
      };
    }
    return { status: "saved" as const, name };
  });

  return T3TeamRepositorySecretPublisher.of({ set });
});

export const layer = Layer.effect(T3TeamRepositorySecretPublisher, make);
