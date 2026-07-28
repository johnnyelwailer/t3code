// @effect-diagnostics nodeBuiltinImport:off
/**
 * Shared test harness for `t3team-ToolAuthService.test.ts` and
 * `t3team-installService.test.ts` — the fake pty adapter, `makeService`,
 * temp-home helpers, the controllable binary check, and `waitFor`. Extracted
 * so both files drive the exact same doubles instead of duplicating them
 * (see CLAUDE.md's Maintainability section on shared test scaffolding).
 *
 * @module toolauth/toolauthTestHarness
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";

import * as ProcessRunner from "../processRunner.ts";
import * as PtyAdapter from "../terminal/PtyAdapter.ts";
import * as ToolAuthService from "./t3team-ToolAuthService.ts";

// Drives the exact same pty path production code uses, but with a stubbed
// `PtyAdapter` — no real process is ever spawned. Mirrors the
// `FakePtyProcess`/`FakePtyAdapter` pattern already used by
// `terminal/Manager.test.ts` for the same reason.
export class FakePtyProcess {
  readonly pid = 4242;
  readonly writes: string[] = [];
  killed = false;
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<(event: PtyAdapter.PtyExitEvent) => void>();

  write(data: string): void {
    this.writes.push(data);
  }
  resize(): void {}
  kill(): void {
    this.killed = true;
  }
  onData(callback: (data: string) => void): () => void {
    this.dataListeners.add(callback);
    return () => this.dataListeners.delete(callback);
  }
  onExit(callback: (event: PtyAdapter.PtyExitEvent) => void): () => void {
    this.exitListeners.add(callback);
    return () => this.exitListeners.delete(callback);
  }
  emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }
  emitExit(event: PtyAdapter.PtyExitEvent): void {
    for (const listener of this.exitListeners) listener(event);
  }
}

export class FakePtyAdapterService {
  readonly processes: FakePtyProcess[] = [];
  readonly spawnInputs: PtyAdapter.PtySpawnInput[] = [];

  spawn(input: PtyAdapter.PtySpawnInput): Effect.Effect<PtyAdapter.PtyProcess, PtyAdapter.PtySpawnError> {
    this.spawnInputs.push(input);
    const process = new FakePtyProcess();
    this.processes.push(process);
    return Effect.succeed(process);
  }
}

export class WaitForConditionError extends Data.TaggedError("WaitForConditionError")<{
  readonly message: string;
}> {}

export const waitFor = <E, R>(
  predicate: Effect.Effect<boolean, E, R>,
  timeout: Duration.Input = 800,
): Effect.Effect<void, WaitForConditionError | E, R> =>
  predicate.pipe(
    Effect.filterOrFail(
      (done) => done,
      () => new WaitForConditionError({ message: "Condition not met" }),
    ),
    Effect.retry(Schedule.spaced("15 millis")),
    Effect.timeoutOption(timeout),
    Effect.flatMap((result) =>
      Option.match(result, {
        onNone: () => Effect.fail(new WaitForConditionError({ message: "Timed out waiting for condition" })),
        onSome: () => Effect.void,
      }),
    ),
  );

export function makeTempHome(): string {
  return NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-toolauth-service-"));
}

export function removeTempHome(homeDir: string): void {
  NodeFS.rmSync(homeDir, { recursive: true, force: true });
}

// FAKE declares no `status.probe`, so ProcessRunner is never actually
// invoked by these tests — the real layer is provided anyway since it's
// harmless and keeps the test setup simple.
const testLayer = Layer.mergeAll(NodeServices.layer, ProcessRunner.layer.pipe(Layer.provide(NodeServices.layer)));

export function makeService(
  homeDir: string,
  overrides: Partial<ToolAuthService.ToolAuthServiceOptions> = {},
) {
  const ptyAdapter = new FakePtyAdapterService();
  return ToolAuthService.makeWithOptions({
    ptyAdapter,
    homeDir,
    env: {},
    tools: ["fake"],
    ...overrides,
  }).pipe(
    Effect.provide(testLayer),
    Effect.map((service) => ({ service, ptyAdapter })),
  );
}

/**
 * A controllable stand-in for "is this binary on PATH", so install() tests
 * never depend on what happens to be installed on the machine running them
 * (`fake`'s own command is `node`, which is always present) — see
 * `ToolAuthServiceOptions.checkBinaryAvailable`'s doc comment.
 */
export function makeControllableBinaryCheck(initiallyPresent: boolean) {
  let present = initiallyPresent;
  const calls: string[] = [];
  const check = (binary: string): Effect.Effect<boolean> => {
    calls.push(binary);
    return Effect.succeed(present);
  };
  return {
    check,
    calls,
    setPresent(value: boolean) {
      present = value;
    },
  };
}

export const firstFakeState = (service: ToolAuthService.ToolAuthService["Service"]) =>
  service.list.pipe(Effect.map((states) => states[0]));
