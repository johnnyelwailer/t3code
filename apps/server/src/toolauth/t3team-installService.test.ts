// @effect-diagnostics nodeBuiltinImport:off
import { describe, expect, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import { FAKE } from "./t3team-adapters.ts";
import { buildNpmInstallArgv } from "./t3team-installCommand.ts";
import { getInstallPackage } from "./t3team-installPackages.ts";
import {
  firstFakeState,
  makeControllableBinaryCheck,
  makeService,
  makeTempHome,
  removeTempHome,
  waitFor,
} from "./t3team-toolauthTestHarness.ts";

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
          loginProcess.emitData("If it does not open, visit: https://example.invalid/device/AbC123\n");
          yield* waitFor(
            firstFakeState(service).pipe(Effect.map((s) => s?.phase === "awaiting-open")),
          );
          loginProcess.emitData("Login successful\n");
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

  it.effect("guards against install calls raced CONCURRENTLY, not just sequentially", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      try {
        const binaryCheck = makeControllableBinaryCheck(false);
        const { service, ptyAdapter } = yield* makeService(homeDir, {
          checkBinaryAvailable: binaryCheck.check,
        });

        // The sequential version of this test passes even with a broken guard,
        // because the first call finishes before the second begins. Racing them
        // is what exposes the time-of-check/time-of-use window: the binary check
        // suspends between "is one already running?" and the spawn, so both
        // callers used to get through and spawn a package manager each.
        const states = yield* Effect.all(
          [service.install("fake"), service.install("fake"), service.install("fake")],
          { concurrency: "unbounded" },
        );

        for (const state of states) {
          expect(["installing", "starting"]).toContain(state.phase);
        }
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
