// @effect-diagnostics nodeBuiltinImport:off
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { FAKE } from "./t3team-adapters.ts";
import type * as ToolAuthService from "./t3team-ToolAuthService.ts";
import {
  firstFakeState,
  makeService,
  makeTempHome,
  removeTempHome,
  waitFor,
} from "./t3team-toolauthTestHarness.ts";

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

        process.emitData("If it does not open, visit: https://example.invalid/device/AbC123\n");
        yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "awaiting-open")));
        expect((yield* firstFakeState(service))?.url).toBe("https://example.invalid/device/AbC123");

        process.emitData("Paste code here if prompted:");
        yield* waitFor(firstFakeState(service).pipe(Effect.map((s) => s?.phase === "awaiting-code")));

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
          Effect.sync(
            () =>
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
});
