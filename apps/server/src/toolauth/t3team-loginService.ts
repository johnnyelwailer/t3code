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
import { ToolAuthSpawnError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SynchronizedRef from "effect/SynchronizedRef";

import * as PtyAdapter from "@t3tools/shared/PtyAdapter";
import { adapterForHost, getAdapter } from "./t3team-adapters.ts";
import { wireLoginProcess } from "./t3team-loginProcessWiring.ts";
import { killSessionProcess, makeToolAuthSessionControl } from "./t3team-loginSessionControl.ts";
import type { ActiveSession } from "./t3team-ToolAuthService.ts";
import type { ToolSingleFlight } from "./t3team-singleFlight.ts";
import type { AuthState, ToolAuthAdapter } from "./t3team-types.ts";

/** `hostname`: sign in to this host instead of the adapter's default (per-host CLIs only). */
export interface ToolAuthStartOptions {
  readonly hostname?: string | undefined;
}

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
  /** The adapter's own status check, to verify a login that exited 0 without a success line. */
  readonly probe: (adapter: ToolAuthAdapter) => Effect.Effect<AuthState>;
  readonly homeDir: string;
  readonly env: NodeJS.ProcessEnv;
  /** Shared with the install flow so start() and install() cannot race each other. */
  readonly singleFlight: ToolSingleFlight;
  /**
   * "Is this binary on PATH?" — the same seam the install flow uses, checked
   * BEFORE spawning so a missing binary reports a plain failed state the card
   * can show, instead of a bare spawn ENOENT the caller only sees as a toast.
   */
  readonly checkBinaryAvailable: (binary: string) => Effect.Effect<boolean>;
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
    probe,
    homeDir,
    env,
    singleFlight,
    checkBinaryAvailable,
  } = deps;

  const spawnLoginProcess = Effect.fn("toolauth.spawnLoginProcess")(function* (
    tool: string,
    adapter: ToolAuthAdapter,
  ) {
    const [shell, ...args] = adapter.command;

    // A missing binary must say so plainly, on the card: register a failed
    // state (no process — terminal states need none) instead of letting the
    // spawn die with an ENOENT the caller only ever sees as a generic toast.
    // `install()` already re-checks this after a successful install, so this
    // only ever reports a binary that genuinely is not there yet.
    if (!(yield* checkBinaryAvailable(shell!))) {
      const missingState: AuthState = {
        tool,
        phase: "failed",
        ...(adapter.hostname === undefined ? {} : { hostname: adapter.hostname }),
        message: `${shell} is not installed on this machine — install it on the host, then try again.`,
      };
      yield* SynchronizedRef.update(sessionsRef, (sessions) => {
        const next = new Map(sessions);
        next.set(tool, { adapter, state: missingState });
        return next;
      });
      yield* notifyUpdate(missingState);
      return missingState;
    }

    const initialState: AuthState = {
      tool,
      phase: "starting",
      ...(adapter.hostname === undefined ? {} : { hostname: adapter.hostname }),
    };

    const process = yield* ptyAdapter
      .spawn({
        shell: shell!,
        args,
        cwd: homeDir,
        cols: 80,
        rows: 30,
        // Adapter-specific variables (gh's GH_NO_BROWSER) win over the
        // service env: they exist precisely to change host behaviour.
        env: { ...env, ...adapter.spawnEnv },
      })
      .pipe(Effect.mapError((cause) => new ToolAuthSpawnError({ tool, cause })));

    yield* SynchronizedRef.update(sessionsRef, (sessions) => {
      const next = new Map(sessions);
      next.set(tool, { adapter, process, state: initialState });
      return next;
    });
    yield* notifyUpdate(initialState);

    // Data/exit wiring (read assembly, auto-Enter answer, exit settlement)
    // lives in `t3team-loginProcessWiring.ts`; it guards stale processes by
    // identity against the session map this spawn just wrote.
    wireLoginProcess({ process, tool, adapter, sessionsRef, applySessionUpdate, probe });

    return initialState;
  });

  const start = Effect.fn("toolauth.start")(function* (
    tool: string,
    options?: ToolAuthStartOptions,
  ) {
    // A per-host CLI (gh) signs in to the host the caller needs, not only the deployment default.
    const adapter = adapterForHost(getAdapter(tool), options?.hostname);
    if (adapter === undefined) {
      return yield* new ToolAuthSpawnError({
        tool,
        cause: new Error(`${tool} signs in to one host only`),
      });
    }

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
      // A sign-in to ANOTHER host is not this one: joining it would hand back a flow that signs
      // the wrong host in. It is abandoned for the host asked for now.
      const otherHost =
        existing.process !== undefined &&
        existing.state.phase !== "installing" &&
        existing.state.hostname !== undefined &&
        adapter.hostname !== undefined &&
        existing.state.hostname !== adapter.hostname;
      if (!otherHost) return existing.state;
      yield* killSessionProcess(existing.process);
    }

    return yield* spawnLoginProcess(tool, adapter);
  });

  const { submitCode, cancel } = makeToolAuthSessionControl({
    sessionsRef,
    notifyUpdate,
    applySessionUpdate,
    stateForTool,
  });

  return { spawnLoginProcess, start, submitCode, cancel };
}
