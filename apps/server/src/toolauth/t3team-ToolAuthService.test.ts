// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";

import * as ProcessRunner from "../processRunner.ts";
import * as PtyAdapter from "../terminal/PtyAdapter.ts";
import { FAKE, getInstallPackage } from "./t3team-adapters.ts";
import { buildNpmInstallArgv } from "./t3team-installCommand.ts";
import * as ToolAuthService from "./t3team-ToolAuthService.ts";

// Drives the exact same pty path production code uses, but with a stubbed
// `PtyAdapter` — no real process is ever spawned. Mirrors the
// `FakePtyProcess`/`FakePtyAdapter` pattern already used by
// `terminal/Manager.test.ts` for the same reason.
class FakePtyProcess {
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

class FakePtyAdapterService {
  readonly processes: FakePtyProcess[] = [];
  readonly spawnInputs: PtyAdapter.PtySpawnInput[] = [];

  spawn(input: PtyAdapter.PtySpawnInput): Effect.Effect<PtyAdapter.PtyProcess, PtyAdapter.PtySpawnError> {
    this.spawnInputs.push(input);
    const process = new FakePtyProcess();
    this.processes.push(process);
    return Effect.succeed(process);
  }
}

class WaitForConditionError extends Data.TaggedError("WaitForConditionError")<{
  readonly message: string;
}> {}

const waitFor = <E, R>(
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

function makeTempHome(): string {
  return NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-toolauth-service-"));
}

function removeTempHome(homeDir: string): void {
  NodeFS.rmSync(homeDir, { recursive: true, force: true });
}

// FAKE declares no `status.probe`, so ProcessRunner is never actually
// invoked by these tests — the real layer is provided anyway since it's
// harmless and keeps the test setup simple.
const testLayer = Layer.mergeAll(NodeServices.layer, ProcessRunner.layer.pipe(Layer.provide(NodeServices.layer)));

function makeService(
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
function makeControllableBinaryCheck(initiallyPresent: boolean) {
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

const firstFakeState = (service: ToolAuthService.ToolAuthService["Service"]) =>
  service.list.pipe(Effect.map((states) => states[0]));

describe("ToolAuthService", () => {
  it.effect("start() spawns via the pty adapter with the adapter's command, in the starting phase", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service, ptyAdapter } = yield* makeService(homeDir);
        const state = yield* service.start("fake");
        expect(state.phase).toBe("starting");
        expect(ptyAdapter.processes).toHaveLength(1);
        expect(ptyAdapter.spawnInputs[0]?.shell).toBe(FAKE.command[0]);
        expect(ptyAdapter.spawnInputs[0]?.args).toEqual(FAKE.command.slice(1));
        expect(ptyAdapter.spawnInputs[0]?.cwd).toBe(homeDir);
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("returns the existing session instead of spawning twice", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service, ptyAdapter } = yield* makeService(homeDir);
        yield* service.start("fake");
        yield* service.start("fake");
        expect(ptyAdapter.processes).toHaveLength(1);
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("advances phase as the CLI emits its three-beat output", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service, ptyAdapter } = yield* makeService(homeDir);
        yield* service.start("fake");
        const process = ptyAdapter.processes[0]!;

        process.emitData("If it does not open, visit: https://example.invalid/device/AbC123");
        yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "awaiting-open")));
        expect((yield* firstFakeState(service))?.url).toBe("https://example.invalid/device/AbC123");

        process.emitData("Paste code here if prompted:");
        yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "awaiting-code")));

        process.emitData("Login successful");
        yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "connected")));
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("submitCode writes the trimmed code back and moves to verifying", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service, ptyAdapter } = yield* makeService(homeDir);
        yield* service.start("fake");
        const process = ptyAdapter.processes[0]!;
        process.emitData("If it does not open, visit: https://example.invalid/device/AbC123");
        process.emitData("Paste code here if prompted:");
        yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "awaiting-code")));

        const state = yield* service.submitCode("fake", "  GOOD  ");
        expect(state.phase).toBe("verifying");
        expect(process.writes).toEqual(["GOOD\n"]);
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("rejects submitCode when not awaiting a code", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service } = yield* makeService(homeDir);
        yield* service.start("fake");
        const result = yield* Effect.flip(service.submitCode("fake", "GOOD"));
        expect(result._tag).toBe("ToolAuthNotAwaitingCodeError");
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("rejects submitCode when there is no active session", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service } = yield* makeService(homeDir);
        const result = yield* Effect.flip(service.submitCode("fake", "GOOD"));
        expect(result._tag).toBe("ToolAuthNoActiveSessionError");
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("cancel kills the process and re-probes a fresh (idle) status", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service, ptyAdapter } = yield* makeService(homeDir);
        yield* service.start("fake");
        const process = ptyAdapter.processes[0]!;
        const state = yield* service.cancel("fake");
        expect(process.killed).toBe(true);
        expect(state.phase).toBe("idle");
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("treats a clean exit before any terminal phase as connected", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service, ptyAdapter } = yield* makeService(homeDir);
        yield* service.start("fake");
        const process = ptyAdapter.processes[0]!;
        process.emitExit({ exitCode: 0, signal: null });
        yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "connected")));
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("treats a non-zero exit before any terminal phase as failed", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service, ptyAdapter } = yield* makeService(homeDir);
        yield* service.start("fake");
        const process = ptyAdapter.processes[0]!;
        process.emitExit({ exitCode: 1, signal: null });
        yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "failed")));
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("start() after a failure spawns a fresh process (Retry must not be a no-op)", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service, ptyAdapter } = yield* makeService(homeDir);
        yield* service.start("fake");
        const firstProcess = ptyAdapter.processes[0]!;
        firstProcess.emitExit({ exitCode: 1, signal: null });
        yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "failed")));

        const retried = yield* service.start("fake");
        expect(retried.phase).toBe("starting");
        expect(ptyAdapter.processes).toHaveLength(2);

        // The old process's callbacks must be inert now that the session
        // points at the new one.
        firstProcess.emitData("Login successful");
        yield* Effect.yieldNow;
        expect((yield* firstFakeState(service))?.phase).toBe("starting");
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("start() after a connected session (Reconnect) spawns a fresh process", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service, ptyAdapter } = yield* makeService(homeDir);
        yield* service.start("fake");
        ptyAdapter.processes[0]!.emitExit({ exitCode: 0, signal: null });
        yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "connected")));

        const reconnected = yield* service.start("fake");
        expect(reconnected.phase).toBe("starting");
        expect(ptyAdapter.processes).toHaveLength(2);
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("attachStream emits a snapshot, then live updates, until unsubscribed", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const { service, ptyAdapter } = yield* makeService(homeDir);
        const events: ToolAuthService.ToolAuthServiceStreamEvent[] = [];
        const unsubscribe = yield* service.attachStream((event) =>
          Effect.sync(() => {
            events.push(event);
          }),
        );

        yield* waitFor(Effect.sync(() => events.length >= 1));
        expect(events[0]?.type).toBe("snapshot");

        yield* service.start("fake");
        const process = ptyAdapter.processes[0]!;
        process.emitData("If it does not open, visit: https://example.invalid/device/AbC123");
        yield* waitFor(
          Effect.sync(
            () =>
              events.some(
                (event) => event.type === "update" && event.state.phase === "awaiting-open",
              ),
          ),
        );

        const eventCountAtUnsubscribe = events.length;
        yield* Effect.sync(unsubscribe);
        process.emitData("Login successful");

        // Assert the negative: no further event arrives. The onData handler
        // forks a plain SynchronizedRef-based effect with no sleeps of its
        // own, so a handful of cooperative yields (fiber scheduling, not
        // Clock-based) are enough to flush it — unlike `waitFor`, which
        // would have to actually reach its timeout to prove a negative, and
        // races a never-succeeding retry loop against that timeout in a way
        // that starves the timeout under this test's virtual Clock.
        for (let i = 0; i < 10; i += 1) {
          yield* Effect.yieldNow;
        }
        expect(events.length).toBe(eventCountAtUnsubscribe);
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );
});

describe("ToolAuthService.install — one click installs AND signs in", () => {
  it.effect("skips straight to the real login flow when the binary is already present", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const binaryCheck = makeControllableBinaryCheck(true);
        const { service, ptyAdapter } = yield* makeService(homeDir, {
          checkBinaryAvailable: binaryCheck.check,
        });

        const state = yield* service.install("fake");

        expect(state.phase).toBe("starting");
        expect(ptyAdapter.processes).toHaveLength(1);
        expect(ptyAdapter.spawnInputs[0]?.shell).toBe(FAKE.command[0]);
        expect(ptyAdapter.spawnInputs[0]?.args).toEqual(FAKE.command.slice(1));
        expect(binaryCheck.calls).toEqual(["node"]);
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("spawns npm install with the exact argv the static package table derives", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const binaryCheck = makeControllableBinaryCheck(false);
        const { service, ptyAdapter } = yield* makeService(homeDir, {
          checkBinaryAvailable: binaryCheck.check,
        });

        const state = yield* service.install("fake");

        expect(state.phase).toBe("installing");
        expect(ptyAdapter.processes).toHaveLength(1);
        // The client only ever sends the tool id ("fake" here stands in for
        // "claude"/"codex" — see installCommand.test.ts for the real
        // packages). This argv is entirely derived from
        // `TOOL_INSTALL_PACKAGES`, never from anything client-supplied.
        const expectedArgv = buildNpmInstallArgv(getInstallPackage("fake").npmPackageName);
        expect(ptyAdapter.spawnInputs[0]?.shell).toBe(expectedArgv[0]);
        expect(ptyAdapter.spawnInputs[0]?.args).toEqual(expectedArgv.slice(1));
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect(
    "chains straight into the real sign-in flow once the install succeeds and re-probes present",
    () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const binaryCheck = makeControllableBinaryCheck(false);
          const { service, ptyAdapter } = yield* makeService(homeDir, {
            checkBinaryAvailable: binaryCheck.check,
          });

          yield* service.install("fake");
          const installProcess = ptyAdapter.processes[0]!;
          installProcess.emitData("added 1 package in 2s\n");
          yield* waitFor(
            firstFakeState(service).pipe(
              Effect.map((s) => s?.installLog?.includes("added 1 package") ?? false),
            ),
          );

          // The package manager reports success AND the binary is now really
          // there — never assume success from exit code alone, but here the
          // re-probe agrees with it.
          binaryCheck.setPresent(true);
          installProcess.emitExit({ exitCode: 0, signal: null });

          // Chained straight into the real login pty — a SECOND process, no
          // separate client request, no "installed, now click connect".
          yield* waitFor(Effect.sync(() => ptyAdapter.processes.length === 2));
          const loginProcess = ptyAdapter.processes[1]!;
          expect(ptyAdapter.spawnInputs[1]?.shell).toBe(FAKE.command[0]);
          yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "starting")));

          // The rest of the journey is the same three-beat flow proven above.
          loginProcess.emitData("If it does not open, visit: https://example.invalid/device/AbC123");
          yield* waitFor(
            firstFakeState(service).pipe(Effect.map((s) => s?.phase === "awaiting-open")),
          );
          loginProcess.emitData("Login successful");
          yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "connected")));
        } finally {
          removeTempHome(homeDir);
        }
      }),
  );

  it.effect(
    "reports failure with the package manager's own error text when the re-probe still finds nothing",
    () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const binaryCheck = makeControllableBinaryCheck(false);
          const { service, ptyAdapter } = yield* makeService(homeDir, {
            checkBinaryAvailable: binaryCheck.check,
          });

          yield* service.install("fake");
          const installProcess = ptyAdapter.processes[0]!;
          installProcess.emitData("npm warn deprecated something\n");
          installProcess.emitData("npm ERR! code E403\n");
          installProcess.emitData(
            "npm ERR! 403 Forbidden - GET https://registry.npmjs.org/@t3code-toolauth-fixture/fake\n",
          );
          // Binary check stays false — the exit code alone must not decide this.
          installProcess.emitExit({ exitCode: 0, signal: null });

          yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "failed")));
          const state = yield* firstFakeState(service);
          expect(state?.message).toContain("npm ERR! 403 Forbidden");
          expect(state?.message).not.toContain("npm warn deprecated");
          // No login pty was ever spawned — only the one install attempt.
          expect(ptyAdapter.processes).toHaveLength(1);
        } finally {
          removeTempHome(homeDir);
        }
      }),
  );

  it.effect("falls back to the exit code when there is no usable installer output at all", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const binaryCheck = makeControllableBinaryCheck(false);
        const { service, ptyAdapter } = yield* makeService(homeDir, {
          checkBinaryAvailable: binaryCheck.check,
        });

        yield* service.install("fake");
        const installProcess = ptyAdapter.processes[0]!;
        installProcess.emitExit({ exitCode: 1, signal: null });

        yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "failed")));
        const state = yield* firstFakeState(service);
        expect(state?.message).toContain("code 1");
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("guards against a concurrent install — a second call joins the same one", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const binaryCheck = makeControllableBinaryCheck(false);
        const { service, ptyAdapter } = yield* makeService(homeDir, {
          checkBinaryAvailable: binaryCheck.check,
        });

        const first = yield* service.install("fake");
        const second = yield* service.install("fake");

        expect(first.phase).toBe("installing");
        expect(second.phase).toBe("installing");
        expect(ptyAdapter.processes).toHaveLength(1);
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("joins an already-active login flow instead of installing again", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        // Present from the start, so a direct start() (not install()) is
        // exactly what a client would have called for an already-installed
        // tool — install() must recognize the in-progress login and not
        // touch the pty adapter again.
        const binaryCheck = makeControllableBinaryCheck(true);
        const { service, ptyAdapter } = yield* makeService(homeDir, {
          checkBinaryAvailable: binaryCheck.check,
        });

        yield* service.start("fake");
        const joined = yield* service.install("fake");

        expect(joined.phase).toBe("starting");
        expect(ptyAdapter.processes).toHaveLength(1);
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  // `it.live`, not `it.effect`, and deliberately so: this is the one test whose
  // condition cannot be true on the first attempt — it requires real time to
  // elapse for the install timeout to fire. `it.effect` supplies a virtual
  // TestClock, under which `waitFor`'s `Schedule.spaced("15 millis")` retry
  // never advances, so the test hangs until vitest kills it rather than failing.
  // Every other test here passes under the test clock because its predicate is
  // already satisfied when first evaluated.
  it.live("a hung install times out, kills the process, and frees the slot for a retry", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const binaryCheck = makeControllableBinaryCheck(false);
        const { service, ptyAdapter } = yield* makeService(homeDir, {
          checkBinaryAvailable: binaryCheck.check,
          installTimeout: Duration.millis(30),
        });

        yield* service.install("fake");
        const installProcess = ptyAdapter.processes[0]!;
        // Never emits exit — simulates a hung installer.

        yield* waitFor(
          firstFakeState(service).pipe(Effect.map((s) => s?.phase === "failed")),
          Duration.millis(2000),
        );
        const state = yield* firstFakeState(service);
        expect(state?.message).toContain("timed out");
        expect(installProcess.killed).toBe(true);

        // The slot is free: a retry spawns a fresh process rather than
        // joining the timed-out one.
        binaryCheck.setPresent(true);
        const retried = yield* service.install("fake");
        expect(retried.phase).toBe("starting");
        expect(ptyAdapter.processes).toHaveLength(2);
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );

  it.effect("retrying after a failed install re-checks presence rather than replaying history", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const binaryCheck = makeControllableBinaryCheck(false);
        const { service, ptyAdapter } = yield* makeService(homeDir, {
          checkBinaryAvailable: binaryCheck.check,
        });

        yield* service.install("fake");
        ptyAdapter.processes[0]!.emitExit({ exitCode: 1, signal: null });
        yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "failed")));

        // Between attempts, imagine the human installed it by hand.
        binaryCheck.setPresent(true);
        const retried = yield* service.install("fake");

        expect(retried.phase).toBe("starting");
        expect(ptyAdapter.processes).toHaveLength(2);
      } finally {
        removeTempHome(homeDir);
      }
    }),
  );
});
