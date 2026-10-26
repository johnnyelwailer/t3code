/**
 * One command runs with named, granted user secrets: as private files or environment variables
 * (process injection), or as local base URLs that add the credential to requests for one host
 * (request injection, where the command never holds the value). Before anything returns to the
 * agent, every value and its common encodings are masked. Each use is approved by the entry's
 * policy and audited; each forwarded request is audited too.
 *
 * Masking keeps values out of the agent's context, not out of the command's reach: a command given
 * a file or env value could still send it anywhere, which is why the user approves the use and why
 * request injection is the stronger mode.
 *
 * The service is host-neutral: an agent's MCP call passes its thread, an unattended automation run
 * passes only its own id and relies on standing grants (scripts, not agents, hold its secrets).
 */
import type { ThreadId, UserSecretRunInput, UserSecretRunResult } from "@t3tools/contracts";
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
import { injectedEnvironment, shellInvocation } from "./t3team-userSecretProcessEnv.ts";
import type { ForwardedRequest } from "./t3team-userSecretRequestForward.ts";
import { UserSecretRequestInjection } from "./t3team-UserSecretRequestInjection.ts";
import { auditForwarded, auditUses, usesOf } from "./t3team-userSecretRunAudit.ts";
import { planRun } from "./t3team-userSecretRunPlan.ts";
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
  const requests = yield* UserSecretRequestInjection;
  const approvals = yield* UserSecretApprovals;
  const audit = yield* UserSecretAudit;
  const runner = yield* ProcessRunner.ProcessRunner;
  const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>();

  const run: UserSecretProcessInjection["Service"]["run"] = Effect.fn(
    "UserSecretProcessInjection.run",
  )(function* ({ consumerId, threadId, tool, cwd, input }) {
    const now = yield* DateTime.now;
    const context = { audit, at: DateTime.formatIso(now), consumer: consumerId, tool };
    const fail = (message: string) => Effect.fail(new UserSecretInjectionError({ message }));

    const plan = planRun(input, resolver.grant, DateTime.toEpochMillis(now));
    if ("refused" in plan) {
      const { name, mode, reason, message } = plan.refused;
      const destination = input.secrets.find((binding) => binding.name === name)?.destination;
      yield* auditUses(
        context,
        [{ name, mode, destination: destination ?? input.destination }],
        "refused",
        { reason },
      );
      return yield* fail(message);
    }
    const uses = plan.uses;
    const authorization = yield* approvals.authorize({
      consumerId,
      threadId,
      grants: uses.map((use) => use.grant),
      mode: uses.every((use) => use.mode === "requestInjection")
        ? "requestInjection"
        : "processInjection",
      command: input.command,
      destination: input.destination ?? uses.find((use) => use.destination)?.destination,
      purpose: input.purpose,
    });
    const approval = authorization.approval;
    if (authorization.outcome !== "allowed") {
      yield* auditUses(context, usesOf(uses), "declined", {
        reason: authorization.outcome,
        approval,
      });
      return yield* fail(DECLINED_MESSAGES[authorization.outcome]);
    }

    const values = new Map<string, Redacted.Redacted<string>>();
    for (const use of uses) {
      const value = yield* resolver
        .resolve({ name: use.binding.name, mode: use.mode, destination: use.destination })
        .pipe(
          Effect.catch((error) =>
            auditUses(context, usesOf([use]), "refused", { reason: error.reason }).pipe(
              Effect.andThen(fail(error.message)),
            ),
          ),
        );
      values.set(use.binding.name, value);
    }
    const patterns = [...values.values()].flatMap((value) =>
      maskPatternsFor(Redacted.value(value)),
    );
    const forwarded: Array<ForwardedRequest> = [];
    const processUses = usesOf(uses.filter((use) => use.mode === "processInjection"));
    const shell = shellInvocation(input.command, yield* HostProcess.Platform);
    const output = yield* Effect.scoped(
      Effect.gen(function* () {
        const env = yield* injectedEnvironment(uses, values);
        for (const use of uses) {
          if (use.binding.as !== "request" || use.destination === undefined) continue;
          env[use.variable] = yield* requests.open({
            name: use.binding.name,
            host: use.destination,
            patterns,
            forwarded,
          });
        }
        return yield* runner.run({
          ...shell,
          cwd,
          env,
          timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          maxOutputBytes: MAX_OUTPUT_BYTES,
          outputMode: "truncate",
          timeoutBehavior: "timedOutResult",
        });
      }),
    ).pipe(
      Effect.provide(services),
      Effect.ensuring(Effect.suspend(() => auditForwarded(context, forwarded, approval))),
      Effect.catch((error) =>
        auditUses(context, processUses, "used", { reason: "failed_to_run", approval }).pipe(
          Effect.andThen(
            fail(maskText(`The command could not run: ${error.message}`, patterns).text),
          ),
        ),
      ),
    );
    yield* auditUses(context, processUses, "used", { approval });
    return maskProcessOutput(output, patterns);
  });

  return UserSecretProcessInjection.of({ run });
});

export const UserSecretProcessInjectionLive = Layer.effect(UserSecretProcessInjection, make);
