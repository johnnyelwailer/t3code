/**
 * Process injection: one command runs with named, granted user secrets as private files or
 * environment variables. Before anything returns to the agent, every injected value and its common
 * encodings are masked in the output. Each use is approved by the entry's policy and audited.
 *
 * Masking keeps values out of the agent's context, not out of the command's reach: the command
 * itself could still send a value anywhere, which is why the user approves it and why request
 * injection, where the command never holds the value, is the stronger mode.
 *
 * The service is host-neutral: an agent's MCP call passes its thread, an unattended automation run
 * passes only its own id and relies on standing grants (scripts, not agents, hold its secrets).
 */
import type {
  ThreadId,
  UserSecretApproval,
  UserSecretGrant,
  UserSecretRunInput,
  UserSecretRunResult,
  UserSecretUseAudit,
} from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import * as ProcessRunner from "../processRunner.ts";
import { maskPatternsFor, maskProcessOutput, maskText } from "./t3team-secretMasking.ts";
import { UserSecretApprovals } from "./t3team-UserSecretApprovals.ts";
import { UserSecretAudit } from "./t3team-UserSecretAudit.ts";
import { checkGrantUse, userSecretRefusalMessage } from "./t3team-userSecretGrants.ts";
import {
  duplicateVariable,
  injectedEnvironment,
  shellInvocation,
} from "./t3team-userSecretProcessEnv.ts";
import { UserSecretResolver } from "./t3team-UserSecretResolver.ts";

export const USER_SECRET_RUN_TOOL = "t3_user_secret_run";
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

const DECLINED_MESSAGES = {
  declined: "The user did not allow this use. Do not retry it unless they ask.",
  timed_out: "Nobody answered the approval in time. Ask the user before trying again.",
  nobody_to_ask:
    "This use needs the user's approval and there is nobody to ask here. It needs a standing grant.",
} as const;

export class UserSecretInjectionError extends Schema.TaggedError<UserSecretInjectionError>()(
  "UserSecretInjectionError",
  { message: Schema.String },
) {}

export interface UserSecretRunRequest {
  /** Who uses the secrets: a thread id, or an automation run id on another host. */
  readonly consumerId: string;
  /** Where to ask the user for approval; undefined for an unattended consumer. */
  readonly threadId: ThreadId | undefined;
  /** The tool or script recorded in the audit. */
  readonly tool: string;
  readonly cwd: string | undefined;
  readonly input: UserSecretRunInput;
}

export class UserSecretProcessInjection extends Context.Service<
  UserSecretProcessInjection,
  {
    readonly run: (
      request: UserSecretRunRequest,
    ) => Effect.Effect<UserSecretRunResult, UserSecretInjectionError>;
  }
>()("t3/secrets/t3team-UserSecretProcessInjection/UserSecretProcessInjection") {}

const make = Effect.gen(function* () {
  const resolver = yield* UserSecretResolver;
  const approvals = yield* UserSecretApprovals;
  const audit = yield* UserSecretAudit;
  const runner = yield* ProcessRunner.ProcessRunner;
  const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>();

  const run: UserSecretProcessInjection["Service"]["run"] = Effect.fn(
    "UserSecretProcessInjection.run",
  )(function* ({ consumerId, threadId, tool, cwd, input }) {
    const names = [...new Set(input.secrets.map((binding) => binding.name))];
    const nowUtc = yield* DateTime.now;
    const at = DateTime.formatIso(nowUtc);
    const now = DateTime.toEpochMillis(nowUtc);
    let approval: UserSecretApproval | undefined;
    const record = (outcome: UserSecretUseAudit["outcome"], reason?: string) =>
      Effect.forEach(names, (name) =>
        audit.record({
          at,
          consumer: consumerId,
          tool,
          ...(approval === undefined ? {} : { approval }),
          name,
          mode: "processInjection",
          ...(input.destination === undefined ? {} : { destination: input.destination }),
          outcome,
          ...(reason === undefined ? {} : { reason }),
        }),
      );
    const refuse = (reason: string, message: string) =>
      record("refused", reason).pipe(
        Effect.andThen(Effect.fail(new UserSecretInjectionError({ message }))),
      );

    const grants: Array<UserSecretGrant> = [];
    for (const name of names) {
      const grant = resolver.grant(name);
      const refusal = checkGrantUse(name, grant, "processInjection", input.destination, now);
      if (refusal !== undefined || grant === undefined) {
        return yield* refuse(
          refusal ?? "not_granted",
          userSecretRefusalMessage(refusal ?? "not_granted", name),
        );
      }
      grants.push(grant);
    }
    const clash = duplicateVariable(input.secrets);
    if (clash !== undefined)
      return yield* refuse("duplicate_variable", `Two secrets would set ${clash}.`);

    const authorization = yield* approvals.authorize({
      consumerId,
      threadId,
      grants,
      mode: "processInjection",
      command: input.command,
      destination: input.destination,
      purpose: input.purpose,
    });
    approval = authorization.approval;
    if (authorization.outcome !== "allowed") {
      yield* record("declined", authorization.outcome);
      return yield* new UserSecretInjectionError({
        message: DECLINED_MESSAGES[authorization.outcome],
      });
    }

    const values = new Map<string, Redacted.Redacted<string>>();
    for (const name of names) {
      const value = yield* resolver
        .resolve({ name, mode: "processInjection", destination: input.destination })
        .pipe(Effect.catch((error) => refuse(error.reason, error.message)));
      values.set(name, value);
    }
    const patterns = [...values.values()].flatMap((value) =>
      maskPatternsFor(Redacted.value(value)),
    );
    const shell = shellInvocation(input.command, yield* HostProcess.Platform);
    const output = yield* Effect.scoped(
      injectedEnvironment(input.secrets, values).pipe(
        Effect.flatMap((env) =>
          runner.run({
            ...shell,
            cwd,
            env,
            timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            maxOutputBytes: MAX_OUTPUT_BYTES,
            outputMode: "truncate",
            timeoutBehavior: "timedOutResult",
          }),
        ),
      ),
    ).pipe(
      Effect.provide(services),
      Effect.catch((error) =>
        record("used", "failed_to_run").pipe(
          Effect.andThen(
            Effect.fail(
              new UserSecretInjectionError({
                message: maskText(`The command could not run: ${error.message}`, patterns).text,
              }),
            ),
          ),
        ),
      ),
    );
    yield* record("used");
    return maskProcessOutput(output, patterns);
  });

  return UserSecretProcessInjection.of({ run });
});

export const UserSecretProcessInjectionLive = Layer.effect(UserSecretProcessInjection, make);
