/**
 * What a human or the host does to a login that is already running: answer it with a pasted code
 * (`submitCode`), or abandon it (`cancel`). Split from `t3team-loginService.ts`, which starts
 * flows; both act on the same session map.
 *
 * @module toolauth/loginSessionControl
 */
import { ToolAuthNoActiveSessionError, ToolAuthNotAwaitingCodeError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SynchronizedRef from "effect/SynchronizedRef";

import type * as PtyAdapter from "../terminal/PtyAdapter.ts";
import type { ActiveSession } from "./t3team-ToolAuthService.ts";
import type { AuthState } from "./t3team-types.ts";

/** Kills a login process, best-effort — it may already be gone. A session with no process has nothing to kill. */
export const killSessionProcess = (pty: PtyAdapter.PtyProcess | undefined) =>
  Effect.sync(() => {
    try {
      pty?.kill();
    } catch {
      // best-effort — the process may already be gone
    }
  });

export interface ToolAuthSessionControlDeps {
  readonly sessionsRef: SynchronizedRef.SynchronizedRef<Map<string, ActiveSession>>;
  readonly notifyUpdate: (state: AuthState) => Effect.Effect<void>;
  readonly applySessionUpdate: (
    tool: string,
    nextState: AuthState,
    previousState: AuthState,
  ) => Effect.Effect<void>;
  /** Re-probes a tool with no active session — used by `cancel()` to report a fresh status. */
  readonly stateForTool: (tool: string) => Effect.Effect<AuthState>;
}

export function makeToolAuthSessionControl(deps: ToolAuthSessionControlDeps) {
  const { sessionsRef, notifyUpdate, applySessionUpdate, stateForTool } = deps;

  const submitCode = Effect.fn("toolauth.submitCode")(function* (tool: string, code: string) {
    const session = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
    if (!session) return yield* new ToolAuthNoActiveSessionError({ tool });
    if (session.state.phase !== "awaiting-code") {
      return yield* new ToolAuthNotAwaitingCodeError({ tool, phase: session.state.phase });
    }
    // A session without a live process is one that never spawned (the
    // binary-missing failed state above) — there is no CLI to answer.
    const pty = session.process;
    if (!pty) return yield* new ToolAuthNoActiveSessionError({ tool });
    const nextState: AuthState = { ...session.state, phase: "verifying" };
    yield* applySessionUpdate(tool, nextState, session.state);
    yield* Effect.sync(() => pty.write(`${code.trim()}\n`));
    return nextState;
  });

  const cancel = Effect.fn("toolauth.cancel")(function* (tool: string) {
    const session = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
    if (session) {
      // The binary-missing session has no process to kill — just drop the record.
      yield* killSessionProcess(session.process);
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

  return { submitCode, cancel };
}
