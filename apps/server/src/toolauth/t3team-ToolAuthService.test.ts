// @effect-diagnostics nodeBuiltinImport:off
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { FAKE } from "./t3team-adapters.ts";
import { GH } from "./t3team-ghAdapter.ts";
import type * as ToolAuthService from "./t3team-ToolAuthService.ts";
import {
  firstFakeState,
  makeControllableBinaryCheck,
  makeService,
  makeTempHome,
  removeTempHome,
  waitFor,
} from "./t3team-toolauthTestHarness.ts";

describe("ToolAuthService", () => {
  it.effect(
    "start() spawns via the pty adapter with the adapter's command, in the starting phase",
    () =>
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

        process.emitData("If it does not open, visit: https://example.invalid/device/AbC123\n");
        yield* waitFor(
          firstFakeState(service).pipe(Effect.map((s) => s?.phase === "awaiting-open")),
        );
        expect((yield* firstFakeState(service))?.url).toBe("https://example.invalid/device/AbC123");

        process.emitData("Paste code here if prompted:");
        yield* waitFor(
          firstFakeState(service).pipe(Effect.map((s) => s?.phase === "awaiting-code")),
        );

        process.emitData("Login successful\n");
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
        process.emitData("If it does not open, visit: https://example.invalid/device/AbC123\n");
        process.emitData("Paste code here if prompted:");
        yield* waitFor(
          firstFakeState(service).pipe(Effect.map((s) => s?.phase === "awaiting-code")),
        );

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
        firstProcess.emitData("Login successful\n");
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
        process.emitData("If it does not open, visit: https://example.invalid/device/AbC123\n");
        yield* waitFor(
          Effect.sync(() =>
            events.some(
              (event) => event.type === "update" && event.state.phase === "awaiting-open",
            ),
          ),
        );

        const eventCountAtUnsubscribe = events.length;
        yield* Effect.sync(unsubscribe);
        process.emitData("Login successful\n");

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

  describe("gh (GHE device flow)", () => {
    /** Flushes cooperative fibers so auto-Enter writes scheduled after a state update land. */
    const flush = Effect.gen(function* () {
      for (let i = 0; i < 10; i += 1) yield* Effect.yieldNow;
    });

    it.effect("auto-answers the press-enter prompt exactly once, then completes the flow", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const { service, ptyAdapter } = yield* makeService(homeDir, {
            tools: ["gh"],
            checkBinaryAvailable: () => Effect.succeed(true),
          });
          const state = yield* service.start("gh");
          expect(state.phase).toBe("starting");
          const process = ptyAdapter.processes[0]!;

          // Verbatim gh 2.96.0 lines (ANSI-stripped), as captured live.
          process.emitData("! First copy your one-time code: B4A0-AA8E\n");
          process.emitData(
            "Press Enter to open https://nexplore.ghe.com/login/device in your browser...\n",
          );
          yield* waitFor(
            firstFakeState(service).pipe(Effect.map((s) => s?.phase === "awaiting-open")),
          );
          const open = yield* firstFakeState(service);
          expect(open?.url).toBe("https://nexplore.ghe.com/login/device");
          expect(open?.displayCode).toBe("B4A0-AA8E");

          // The Enter is what starts gh's own polling — exactly one, ever.
          expect(process.writes).toEqual(["\n"]);
          process.emitData(
            "Press Enter to open https://nexplore.ghe.com/login/device in your browser...\n",
          );
          yield* flush;
          expect(process.writes).toEqual(["\n"]);

          process.emitData("Authentication complete.\n");
          yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "connected")));
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.effect("answers the press-enter prompt even while the line is still incomplete (no newline yet)", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const { service, ptyAdapter } = yield* makeService(homeDir, {
            tools: ["gh"],
            checkBinaryAvailable: () => Effect.succeed(true),
          });
          yield* service.start("gh");
          const process = ptyAdapter.processes[0]!;

          // The real-pty capture: the code line is complete, but the
          // "Press Enter to open <url>…" line gets no newline while gh blocks
          // on the keypress — it stays the incomplete trailing line (partial).
          // Both the URL capture and the auto-Enter must work off that partial.
          process.emitData("! First copy your one-time code: 4148-FBA3\r\n");
          process.emitData(
            "Press Enter to open https://nexplore.ghe.com/login/device in your browser... ",
          );
          yield* waitFor(
            firstFakeState(service).pipe(Effect.map((s) => s?.phase === "awaiting-open")),
          );
          const open = yield* firstFakeState(service);
          expect(open?.url).toBe("https://nexplore.ghe.com/login/device");
          expect(open?.displayCode).toBe("4148-FBA3");
          // The Enter is sent although the prompt line never completed.
          yield* flush;
          expect(process.writes).toEqual(["\n"]);
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.effect("spawns with the GHE device-flow argv", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const { service, ptyAdapter } = yield* makeService(homeDir, {
            tools: ["gh"],
            checkBinaryAvailable: () => Effect.succeed(true),
          });
          yield* service.start("gh");
          expect(ptyAdapter.spawnInputs[0]?.shell).toBe(GH.command[0]);
          expect(ptyAdapter.spawnInputs[0]?.args).toEqual(GH.command.slice(1));
          // Enter must start polling WITHOUT opening the host's browser — the
          // user opens the card's URL themselves, once the code is copied.
          // gh's documented launcher override is `GH_BROWSER` (verified: it is
          // invoked with the device URL on Enter); `GH_NO_BROWSER` is NOT a gh
          // variable, so pointing the launcher at a no-op is what suppresses
          // the window while keeping the Enter (and thus the polling).
          expect(ptyAdapter.spawnInputs[0]?.env).toEqual(
            expect.objectContaining({ GH_BROWSER: "/usr/bin/true" }),
          );
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.effect("reports a plainly-worded failed state when the binary is missing, without spawning", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const binaryCheck = makeControllableBinaryCheck(false);
          const { service, ptyAdapter } = yield* makeService(homeDir, {
            tools: ["gh"],
            checkBinaryAvailable: binaryCheck.check,
          });
          const state = yield* service.start("gh");
          expect(state.phase).toBe("failed");
          expect(state.message).toContain("gh is not installed on this machine");
          expect(ptyAdapter.processes).toHaveLength(0);

          // The card renders from list(), which must report the same state.
          const listed = yield* service.list;
          expect(listed[0]?.phase).toBe("failed");

          // Retry stays failed while the binary is still absent — no spawn.
          const retried = yield* service.start("gh");
          expect(retried.phase).toBe("failed");
          expect(ptyAdapter.processes).toHaveLength(0);

          // Once it appears, the next start spawns the real flow.
          binaryCheck.setPresent(true);
          const finallyStarted = yield* service.start("gh");
          expect(finallyStarted.phase).toBe("starting");
          expect(ptyAdapter.processes).toHaveLength(1);
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.effect("cancel() on a process-less failed session does not crash and re-probes", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const { service } = yield* makeService(homeDir, {
            tools: ["gh"],
            checkBinaryAvailable: () => Effect.succeed(false),
          });
          yield* service.start("gh");
          // The re-probe runs the real `gh auth status` against the test
          // machine — its answer is machine-dependent, so assert the invariant
          // (no crash, a valid state, session dropped) rather than the phase.
          const cancelled = yield* service.cancel("gh");
          expect(cancelled.tool).toBe("gh");
          expect(typeof cancelled.phase).toBe("string");
          const listed = yield* service.list;
          expect(listed[0]?.phase).not.toBe("failed");
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );
  });
});
