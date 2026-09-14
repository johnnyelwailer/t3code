/**
 * Wires a login pty's data/exit events into the toolauth state machine.
 *
 * Owns the two pieces of per-process state that must not live in the flow
 * module (which stays under the prefixed-file line cap): the partial-line
 * buffer that survives between pty reads, and the one-shot auto-Enter answer
 * for CLIs that block on a keypress to start their own device polling.
 *
 * @module toolauth/loginProcessWiring
 */
import * as Effect from "effect/Effect";
import * as SynchronizedRef from "effect/SynchronizedRef";

import * as PtyAdapter from "../terminal/PtyAdapter.ts";
import { assemblePtyRead, foldPtyRead, stripAnsi } from "./t3team-advance.ts";
import type { ActiveSession } from "./t3team-ToolAuthService.ts";
import type { AuthState, ToolAuthAdapter } from "./t3team-types.ts";

export interface LoginProcessWiring {
  readonly process: PtyAdapter.PtyProcess;
  readonly tool: string;
  readonly adapter: ToolAuthAdapter;
  readonly sessionsRef: SynchronizedRef.SynchronizedRef<Map<string, ActiveSession>>;
  readonly applySessionUpdate: (
    tool: string,
    nextState: AuthState,
    previousState: AuthState,
  ) => Effect.Effect<void>;
}

export function wireLoginProcess({
  process,
  tool,
  adapter,
  sessionsRef,
  applySessionUpdate,
}: LoginProcessWiring): void {
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

  // The CLI's "Press Enter to open … in your browser" waits for a keypress a
  // headless sandbox never gets; that Enter is what starts gh's own polling,
  // so answer it — exactly once, and atomically, so two interleaved reads
  // cannot double-send.
  let autoEnterSent = false;

  process.onData((chunk) => {
    // RAW chunk on purpose: `foldPtyRead` strips ANSI per assembled line, so
    // an escape sequence split across two reads is reunited before stripping.
    const read = assemblePtyRead(pending, chunk);
    pending = read.pending;
    Effect.runFork(
      Effect.gen(function* () {
        if (!(yield* isCurrentProcess)) return;
        const session = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
        if (!session) return;
        yield* applySessionUpdate(tool, foldPtyRead(session.state, read, adapter), session.state);
        const autoEnter = adapter.match.autoEnter;
        const pty = session.process;
        // The prompt is matched against complete lines AND the trailing
        // partial: a CLI that blocks on a keypress (gh's "Press Enter to
        // open …") prints the prompt and stops, so that line may still be
        // incomplete when it arrives. It is a boolean prompt detector like
        // `awaitingCode` — safe on the partial — and the regex is the full
        // phrase, so a still-printing prefix cannot fire it early.
        if (
          autoEnter &&
          pty &&
          (read.lines.some((line) => autoEnter.test(stripAnsi(line))) ||
            autoEnter.test(stripAnsi(read.partial)))
        ) {
          yield* Effect.sync(() => {
            if (autoEnterSent) return;
            autoEnterSent = true;
            pty.write("\n");
          });
        }
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
}
