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
import { assemblePtyRead, foldPtyRead, stripAnsi } from "./t3team-advance.ts";
import type { ActiveSession } from "./t3team-ToolAuthService.ts";
import type { ToolSingleFlight } from "./t3team-singleFlight.ts";
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
  /** Shared with the install flow so start() and install() cannot race each other. */
  readonly singleFlight: ToolSingleFlight;
}

/**
 * Builds the login flow's public surface (`start`, `submitCode`, `cancel`)
 * plus `spawnLoginProcess` itself — the install flow's successful re-probe
 * chains straight into that same primitive, so it is exposed here rather than
 * kept private.
 */
export function makeToolAuthLoginFlow(deps: ToolAuthLoginFlowDeps) {
  const {
    ptyAdapter,
    sessionsRef,
    notifyUpdate,
    applySessionUpdate,
    stateForTool,
    homeDir,
    env,
    singleFlight,
  } = deps;

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

    // Carries the trailing partial line between pty reads — see the truncation
    // note on `assemblePtyRead`. Advanced SYNCHRONOUSLY here in the callback,
    // not inside the fork: two forks can interleave at their suspension points,
    // so doing the buffer arithmetic in there would fold reads out of order.
    let pending = "";

    process.onData((chunk) => {
      const read = assemblePtyRead(pending, stripAnsi(chunk));
      pending = read.pending;
      Effect.runFork(
        Effect.gen(function* () {
          if (!(yield* isCurrentProcess)) return;
          const session = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
          if (!session) return;
          yield* applySessionUpdate(tool, foldPtyRead(session.state, read, adapter), session.state);
        }),
      );
    });

    process.onExit((event) => {
      // Flush whatever partial line is still buffered BEFORE deciding the
      // terminal phase: a CLI whose final line carries no newline (common for
      // "Login successful" written without one) would otherwise have that line
      // discarded and be reported purely by exit code.
      const flushed = assemblePtyRead(pending, "", { flush: true });
      pending = "";
      Effect.runFork(
        Effect.gen(function* () {
          if (!(yield* isCurrentProcess)) return;
          const session = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
          if (!session) return;
          const settled = foldPtyRead(session.state, flushed, adapter);
          if (settled.phase === "connected" || settled.phase === "failed") {
            yield* applySessionUpdate(tool, settled, session.state);
            return;
          }
          const nextState: AuthState = {
            ...settled,
            phase: event.exitCode === 0 ? "connected" : "failed",
            message: settled.message ?? `exited with code ${event.exitCode}`,
          };
          yield* applySessionUpdate(tool, nextState, session.state);
        }),
      );
    });

    return initialState;
  });

  const start = Effect.fn("toolauth.start")(function* (tool: string) {
    const adapter = getAdapter(tool);

    // Same single-flight claim the install flow takes, and for the same reason:
    // `spawnLoginProcess` suspends at the pty spawn BEFORE it writes the session
    // map, so two concurrent start() calls both read "no active flow" and both
    // spawn a login pty, the second orphaning the first. See t3team-singleFlight.ts.
    if (singleFlight.isClaimed(tool)) {
      // ALWAYS join — never fall through to a spawn. The holder may still be
      // between its claim and writing the session map (that is the whole window
      // this guards), so "claimed but no session yet" is exactly the case that
      // must not spawn a second process. Falling through would also release the
      // other caller's claim on the way out.
      const active = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
      return active?.state ?? { tool, phase: "starting" as const };
    }
    singleFlight.claim(tool);
    return yield* Effect.ensuring(
      startClaimed(tool, adapter),
      Effect.sync(() => {
        singleFlight.release(tool);
      }),
    );
  });

  const startClaimed = Effect.fn("toolauth.startClaimed")(function* (
    tool: string,
    adapter: ToolAuthAdapter,
  ) {
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
