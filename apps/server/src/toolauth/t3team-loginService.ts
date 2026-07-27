/**
 * The interactive login flow behind `ToolAuthService.start()`: spawn the real
 * CLI's login command through the pty, turn its output into UI state via
 * `advance()`, and let the human answer it (`submitCode`) or abandon it
 * (`cancel`). Extracted alongside `t3team-installService.ts` — the two flows
 * only *share* the session/notification primitives below, not state of their
 * own, so each lives in its own module over those shared primitives instead
 * of as closures inside `t3team-ToolAuthService.ts`.
 *
 * @module toolauth/loginService
 */
import {
  ToolAuthNoActiveSessionError,
  ToolAuthNotAwaitingCodeError,
  ToolAuthSpawnError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SynchronizedRef from "effect/SynchronizedRef";

import * as PtyAdapter from "../terminal/PtyAdapter.ts";
import { getAdapter } from "./t3team-adapters.ts";
import { advance, stripAnsi } from "./t3team-advance.ts";
import type { ActiveSession } from "./t3team-ToolAuthService.ts";
import type { AuthState, ToolAuthAdapter } from "./t3team-types.ts";

export interface ToolAuthLoginFlowDeps {
  readonly ptyAdapter: PtyAdapter.PtyAdapter["Service"];
  /** The same `SynchronizedRef` the install flow reads and writes — one session map per tool. */
  readonly sessionsRef: SynchronizedRef.SynchronizedRef<Map<string, ActiveSession>>;
  readonly notifyUpdate: (state: AuthState) => Effect.Effect<void>;
  readonly applySessionUpdate: (
    tool: string,
    nextState: AuthState,
    previousState: AuthState,
  ) => Effect.Effect<void>;
  /** Re-probes a tool with no active session — used by `cancel()` to report a fresh status. */
  readonly stateForTool: (tool: string) => Effect.Effect<AuthState>;
  readonly homeDir: string;
  readonly env: NodeJS.ProcessEnv;
}

/**
 * Builds the login flow's public surface (`start`, `submitCode`, `cancel`)
 * plus `spawnLoginProcess` itself — the install flow's successful re-probe
 * chains straight into that same primitive, so it is exposed here rather than
 * kept private.
 */
export function makeToolAuthLoginFlow(deps: ToolAuthLoginFlowDeps) {
  const { ptyAdapter, sessionsRef, notifyUpdate, applySessionUpdate, stateForTool, homeDir, env } =
    deps;

  const spawnLoginProcess = Effect.fn("toolauth.spawnLoginProcess")(function* (
    tool: string,
    adapter: ToolAuthAdapter,
  ) {
    const [shell, ...args] = adapter.command;
    const initialState: AuthState = { tool, phase: "starting" };

    const process = yield* ptyAdapter
      .spawn({ shell: shell!, args, cwd: homeDir, cols: 80, rows: 30, env })
      .pipe(Effect.mapError((cause) => new ToolAuthSpawnError({ tool, cause })));

    yield* SynchronizedRef.update(sessionsRef, (sessions) => {
      const next = new Map(sessions);
      next.set(tool, { adapter, process, state: initialState });
      return next;
    });
    yield* notifyUpdate(initialState);

    // Guards onData/onExit below against a stale process: if this is called
    // again for this tool (Retry/Reconnect, or the install→login chain), the
    // map's `process` entry moves on to the new one, but the OLD PtyProcess
    // object's listeners are still registered and could otherwise still fire.
    const isCurrentProcess = SynchronizedRef.get(sessionsRef).pipe(
      Effect.map((sessions) => sessions.get(tool)?.process === process),
    );

    process.onData((chunk) => {
      Effect.runFork(
        Effect.gen(function* () {
          if (!(yield* isCurrentProcess)) return;
          const session = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
          if (!session) return;
          const nextState = advance(session.state, stripAnsi(chunk), adapter);
          yield* applySessionUpdate(tool, nextState, session.state);
        }),
      );
    });

    process.onExit((event) => {
      Effect.runFork(
        Effect.gen(function* () {
          if (!(yield* isCurrentProcess)) return;
          const session = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
          if (!session) return;
          if (session.state.phase === "connected" || session.state.phase === "failed") return;
          const nextState: AuthState = {
            ...session.state,
            phase: event.exitCode === 0 ? "connected" : "failed",
            message: session.state.message ?? `exited with code ${event.exitCode}`,
          };
          yield* applySessionUpdate(tool, nextState, session.state);
        }),
      );
    });

    return initialState;
  });

  const start = Effect.fn("toolauth.start")(function* (tool: string) {
    const adapter = getAdapter(tool);
    const existing = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
    // A session sitting in a TERMINAL phase (connected/failed) is history, not
    // an active flow — Retry/Reconnect must be able to start a fresh one.
    // Only an in-progress flow short-circuits here (this includes
    // `installing`: a client calling `start()` directly while an
    // `install()`-driven install is running for the same tool joins it rather
    // than racing a second flow).
    if (existing && existing.state.phase !== "connected" && existing.state.phase !== "failed") {
      return existing.state;
    }

    return yield* spawnLoginProcess(tool, adapter);
  });

  const submitCode = Effect.fn("toolauth.submitCode")(function* (tool: string, code: string) {
    const session = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
    if (!session) return yield* new ToolAuthNoActiveSessionError({ tool });
    if (session.state.phase !== "awaiting-code") {
      return yield* new ToolAuthNotAwaitingCodeError({ tool, phase: session.state.phase });
    }
    const nextState: AuthState = { ...session.state, phase: "verifying" };
    yield* applySessionUpdate(tool, nextState, session.state);
    yield* Effect.sync(() => session.process.write(`${code.trim()}\n`));
    return nextState;
  });

  const cancel = Effect.fn("toolauth.cancel")(function* (tool: string) {
    const session = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
    if (session) {
      yield* Effect.sync(() => {
        try {
          session.process.kill();
        } catch {
          // best-effort — the process may already be gone
        }
      });
      yield* SynchronizedRef.update(sessionsRef, (sessions) => {
        const next = new Map(sessions);
        next.delete(tool);
        return next;
      });
    }
    const state = yield* stateForTool(tool);
    yield* notifyUpdate(state);
    return state;
  });

  return { spawnLoginProcess, start, submitCode, cancel };
}
