/**
 * Adds a missing scope to the user's own `gh` sign-in: runs `gh auth refresh` non-interactively and
 * hands back the device code and page, then reports when gh exits. Output is parsed for the code and
 * page only; it is never returned or logged, and no token passes through here. One refresh runs per
 * host, and each is killed and forgotten after a fixed time. Dependencies are plain so it is host-neutral.
 */
import { CredentialRefreshError } from "@t3tools/contracts";
import type { CredentialRefreshStartInput, CredentialRefreshStatusInput } from "@t3tools/contracts";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- Effect's Crypto has no synchronous random bytes.
import * as NodeCrypto from "node:crypto";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import { forgeHostFor } from "./t3team-credentialHosts.ts";
import { deviceCodeReader, type DeviceCode } from "./t3team-credentialRefreshOutput.ts";

export interface GhProcess {
  /** Decoded output lines, stdout and stderr together; ends when gh closes its output. */
  readonly lines: Stream.Stream<string>;
  /** The exit code once gh ends. */
  readonly exited: Effect.Effect<number>;
  readonly kill: Effect.Effect<void>;
}

export interface CredentialRefreshDeps {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly spawnGh: (args: ReadonlyArray<string>) => Effect.Effect<GhProcess, { message: string }>;
}

const CODE_TIMEOUT = Duration.seconds(15);
const FLOW_LIFETIME = Duration.minutes(15);
const startFailed = () => new CredentialRefreshError({ reason: "start_failed" });

interface Flow {
  readonly host: string;
  readonly code: DeviceCode;
  state: "pending" | "done" | "failed";
}

export function makeCredentialRefresh(deps: CredentialRefreshDeps) {
  const flows = new Map<string, Flow>();
  const startLock = Semaphore.makeUnsafe(1);
  const reply = (id: string, flow: Flow) => ({
    id,
    ...flow.code,
    expiresInSeconds: Duration.toSeconds(FLOW_LIFETIME),
  });

  const awaitCode = Effect.fn("CredentialRefresh.awaitCode")(function* (process: GhProcess) {
    const found = yield* Deferred.make<DeviceCode, CredentialRefreshError>();
    const read = deviceCodeReader();
    yield* process.lines.pipe(
      Stream.runForEach((line) => {
        const code = read(line);
        return code === undefined ? Effect.void : Deferred.succeed(found, code);
      }),
      Effect.ignoreCause,
      Effect.andThen(Deferred.fail(found, startFailed())),
      Effect.forkDetach,
    );
    return yield* Deferred.await(found).pipe(Effect.timeoutOption(CODE_TIMEOUT));
  });

  const launch = Effect.fn("CredentialRefresh.launch")(function* (
    host: string,
    scopes: ReadonlyArray<string>,
  ) {
    const process = yield* deps
      .spawnGh(["auth", "refresh", "-h", host, "-s", scopes.join(",")])
      .pipe(Effect.mapError(startFailed));
    const code = yield* awaitCode(process).pipe(
      Effect.tapError(() => process.kill.pipe(Effect.ignore)),
    );
    if (Option.isNone(code)) {
      yield* process.kill.pipe(Effect.ignore);
      return yield* startFailed();
    }
    return { process, code: code.value };
  });

  const start = Effect.fn("CredentialRefresh.start")(function* (
    input: CredentialRefreshStartInput,
  ) {
    const host = forgeHostFor(input.host, deps.environment.GH_HOST);
    if (host === undefined) return yield* new CredentialRefreshError({ reason: "not_available" });
    return yield* startLock.withPermits(1)(
      Effect.gen(function* () {
        for (const [id, flow] of flows) {
          if (flow.host === host && flow.state === "pending") return reply(id, flow);
        }
        const { process, code } = yield* launch(host, input.scopes);
        const id = NodeCrypto.randomBytes(16).toString("hex");
        const flow: Flow = { host, code, state: "pending" };
        flows.set(id, flow);
        yield* Effect.forkDetach(
          process.exited.pipe(
            Effect.tap((exit) =>
              Effect.sync(() => void (flow.state = exit === 0 ? "done" : "failed")),
            ),
          ),
        );
        yield* Effect.forkDetach(
          Effect.sleep(FLOW_LIFETIME).pipe(
            Effect.andThen(process.kill.pipe(Effect.ignore)),
            Effect.andThen(Effect.sync(() => flows.delete(id))),
          ),
        );
        return reply(id, flow);
      }),
    );
  });

  const status = Effect.fn("CredentialRefresh.status")(function* (
    input: CredentialRefreshStatusInput,
  ) {
    const flow = flows.get(input.id);
    if (flow === undefined) return yield* new CredentialRefreshError({ reason: "unknown_id" });
    return { state: flow.state };
  });

  return { start, status };
}

export type CredentialRefresh = ReturnType<typeof makeCredentialRefresh>;
