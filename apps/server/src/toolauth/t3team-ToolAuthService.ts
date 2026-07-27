/**
 * ToolAuthService - drives a CLI's login flow through the sandbox's real pty
 * service and turns its output into UI state.
 *
 * Consumes `PtyAdapter` (see `../terminal/PtyAdapter.ts`) rather than
 * spawning its own process, so it never needs to know whether it's talking
 * to `node-pty` or the Bun pty implementation, and is trivially testable
 * with a stubbed adapter (no real process).
 *
 * @module toolauth/ToolAuthService
 */
import * as NodeOS from "node:os";

import {
  ToolAuthNoActiveSessionError,
  ToolAuthNotAwaitingCodeError,
  ToolAuthSpawnError,
} from "@t3tools/contracts";
import { isCommandAvailable } from "@t3tools/shared/shell";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as SynchronizedRef from "effect/SynchronizedRef";

import * as ProcessRunner from "../processRunner.ts";
import * as PtyAdapter from "../terminal/PtyAdapter.ts";
import { getAdapter, getInstallPackage, PRODUCTION_TOOLS } from "./t3team-adapters.ts";
import { advance, stripAnsi } from "./t3team-advance.ts";
import { buildNpmInstallArgv } from "./t3team-installCommand.ts";
import {
  appendInstallLog,
  extractInstallErrorMessage,
  isTerminalPhase,
  timedOutInstallState,
} from "./t3team-installFlow.ts";
import { probeStatus } from "./t3team-status.ts";
import type { AuthState, ToolAuthAdapter } from "./t3team-types.ts";

/** Default cap on a single npm install — a hung installer must not pin the slot forever. */
const DEFAULT_INSTALL_TIMEOUT: Duration.Input = Duration.minutes(5);

export { ToolAuthNoActiveSessionError, ToolAuthNotAwaitingCodeError, ToolAuthSpawnError };

/** Internal counterpart of the wire `ToolAuthStreamEvent` — `tool` stays a plain string. */
export type ToolAuthServiceStreamEvent =
  | { readonly type: "snapshot"; readonly tools: ReadonlyArray<AuthState> }
  | { readonly type: "update"; readonly state: AuthState };

interface ActiveSession {
  readonly adapter: ToolAuthAdapter;
  readonly process: PtyAdapter.PtyProcess;
  readonly state: AuthState;
}

/**
 * ToolAuthService - Service tag for the "Connected tools" sign-in flows.
 */
export class ToolAuthService extends Context.Service<
  ToolAuthService,
  {
    /** Current state of every known tool — active session state wins over a fresh probe. */
    readonly list: Effect.Effect<ReadonlyArray<AuthState>>;
    /** Starts (or returns the already-running) sign-in flow for `tool`. */
    readonly start: (tool: string) => Effect.Effect<AuthState, ToolAuthSpawnError>;
    /**
     * One-click "install this CLI", chained straight into `start()` on a
     * successful re-probe — see `installFlow.ts`. Joins an already-running
     * install or login flow instead of starting a second one. Every beat of
     * the journey (`installing` → `starting` → ... → `connected`/`failed`)
     * broadcasts through the same `attachStream` every other method uses.
     */
    readonly install: (tool: string) => Effect.Effect<AuthState, ToolAuthSpawnError>;
    /** Sends the human-pasted code back to the CLI. Only valid in `awaiting-code`. */
    readonly submitCode: (
      tool: string,
      code: string,
    ) => Effect.Effect<AuthState, ToolAuthNotAwaitingCodeError | ToolAuthNoActiveSessionError>;
    /** Kills any active session for `tool` and re-probes its connection status. */
    readonly cancel: (tool: string) => Effect.Effect<AuthState>;
    /**
     * Emits a full snapshot, then live per-tool updates. Returns an
     * unsubscribe function — mirrors `TerminalManager.attachStream`.
     */
    readonly attachStream: (
      listener: (event: ToolAuthServiceStreamEvent) => Effect.Effect<void>,
    ) => Effect.Effect<() => void>;
  }
>()("t3/toolauth/t3team-ToolAuthService/ToolAuthService") {}

export interface ToolAuthServiceOptions {
  readonly ptyAdapter: PtyAdapter.PtyAdapter["Service"];
  /** Test seam: defaults to `os.homedir()`. */
  readonly homeDir?: string;
  /** Test seam: defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** Test seam: which tools `list`/`attachStream` enumerate. Defaults to `PRODUCTION_TOOLS`. */
  readonly tools?: ReadonlyArray<string>;
  /**
   * Test seam: decides whether `install()` skips straight to `start()` and
   * what it re-probes after the package manager exits. Defaults to a real
   * `isCommandAvailable` PATH lookup. Deliberately injectable so tests never
   * depend on what happens to be installed on the machine running them —
   * `fake`'s own command (`node`) is always on PATH, which would otherwise
   * make the "not installed" branch untestable.
   */
  readonly checkBinaryAvailable?: (binary: string) => Effect.Effect<boolean>;
  /** Test seam: caps a single install attempt. Defaults to 5 minutes. */
  readonly installTimeout?: Duration.Input;
}

function hasStateChanged(previous: AuthState, next: AuthState): boolean {
  return (
    previous.phase !== next.phase ||
    previous.url !== next.url ||
    previous.displayCode !== next.displayCode ||
    previous.message !== next.message ||
    previous.account !== next.account ||
    previous.organization !== next.organization ||
    previous.expiresAt !== next.expiresAt ||
    previous.installLog !== next.installLog
  );
}

export const makeWithOptions = Effect.fn("ToolAuthService.makeWithOptions")(function* (
  options: ToolAuthServiceOptions,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const processRunner = yield* ProcessRunner.ProcessRunner;

  const homeDir = options.homeDir ?? NodeOS.homedir();
  const env = options.env ?? process.env;
  const tools = options.tools ?? PRODUCTION_TOOLS;
  const installTimeout = Duration.fromInputUnsafe(options.installTimeout ?? DEFAULT_INSTALL_TIMEOUT);
  const checkBinaryAvailable =
    options.checkBinaryAvailable ??
    ((binary: string) =>
      isCommandAvailable(binary, { env }).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, path),
      ));

  const sessionsRef = yield* SynchronizedRef.make(new Map<string, ActiveSession>());
  const listeners = new Set<(event: ToolAuthServiceStreamEvent) => Effect.Effect<void>>();

  const runProbe = (adapter: ToolAuthAdapter) =>
    probeStatus(adapter, { homeDir, env }).pipe(
      Effect.provideService(ProcessRunner.ProcessRunner, processRunner),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
    );

  const notifyUpdate = (state: AuthState) =>
    Effect.forEach(
      [...listeners],
      (listener) => listener({ type: "update", state }).pipe(Effect.ignoreCause({ log: true })),
      { discard: true },
    );

  const stateForTool = Effect.fn("toolauth.stateForTool")(function* (tool: string) {
    const active = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
    if (active) return active.state;
    return yield* runProbe(getAdapter(tool));
  });

  const list: Effect.Effect<ReadonlyArray<AuthState>> = Effect.forEach(tools, stateForTool);

  const updateSessionState = (tool: string, nextState: AuthState) =>
    SynchronizedRef.update(sessionsRef, (sessions) => {
      const existing = sessions.get(tool);
      if (!existing) return sessions;
      const next = new Map(sessions);
      next.set(tool, { ...existing, state: nextState });
      return next;
    });

  const applySessionUpdate = Effect.fn("toolauth.applySessionUpdate")(function* (
    tool: string,
    nextState: AuthState,
    previousState: AuthState,
  ) {
    yield* updateSessionState(tool, nextState);
    if (hasStateChanged(previousState, nextState)) {
      yield* notifyUpdate(nextState);
    }
  });

  // Extracted from `start()` so the install→login chain (`finishInstall`
  // below) can spawn the real CLI directly, bypassing `start()`'s own
  // "already active" short-circuit — a session sitting in `installing` has no
  // login pty yet, so that chain must never be mistaken for one.
  const spawnLoginProcess = Effect.fn("toolauth.spawnLoginProcess")(function* (
    tool: string,
    adapter: ToolAuthAdapter,
  ) {
    const [shell, ...args] = adapter.command;
    const initialState: AuthState = { tool, phase: "starting" };

    const process = yield* options.ptyAdapter
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

  // Runs once the install pty exits (normally or via the timeout below):
  // re-probes whether the binary is ACTUALLY present now — never assumes
  // success from exit code 0 — and either chains straight into the real
  // login pty (one click, install AND sign in) or reports the package
  // manager's own error text.
  const finishInstall = Effect.fn("toolauth.finishInstall")(function* (
    tool: string,
    adapter: ToolAuthAdapter,
    installState: AuthState,
    fallbackMessage: string,
  ) {
    const binary = adapter.command[0]!;
    const nowPresent = yield* checkBinaryAvailable(binary);

    if (nowPresent) {
      yield* spawnLoginProcess(tool, adapter);
      return;
    }

    const message = extractInstallErrorMessage(installState.installLog) ?? fallbackMessage;
    yield* applySessionUpdate(tool, { tool, phase: "failed", message }, installState);
  });

  const spawnInstallProcess = Effect.fn("toolauth.spawnInstallProcess")(function* (
    tool: string,
    adapter: ToolAuthAdapter,
  ) {
    const pkg = getInstallPackage(tool);
    const [shell, ...args] = buildNpmInstallArgv(pkg.npmPackageName);
    const initialState: AuthState = { tool, phase: "installing", installLog: "" };

    const process = yield* options.ptyAdapter
      .spawn({ shell: shell!, args, cwd: homeDir, cols: 80, rows: 30, env })
      .pipe(Effect.mapError((cause) => new ToolAuthSpawnError({ tool, cause })));

    yield* SynchronizedRef.update(sessionsRef, (sessions) => {
      const next = new Map(sessions);
      next.set(tool, { adapter, process, state: initialState });
      return next;
    });
    yield* notifyUpdate(initialState);

    // Same stale-process guard as `spawnLoginProcess` — matters here too
    // because `finishInstall` replaces this map entry with the login pty the
    // instant the install completes.
    const isCurrentInstallProcess = SynchronizedRef.get(sessionsRef).pipe(
      Effect.map((sessions) => sessions.get(tool)?.process === process),
    );

    process.onData((chunk) => {
      Effect.runFork(
        Effect.gen(function* () {
          if (!(yield* isCurrentInstallProcess)) return;
          const session = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
          if (!session || session.state.phase !== "installing") return;
          const nextState: AuthState = {
            ...session.state,
            installLog: appendInstallLog(session.state.installLog, stripAnsi(chunk)),
          };
          yield* applySessionUpdate(tool, nextState, session.state);
        }),
      );
    });

    process.onExit((event) => {
      Effect.runFork(
        Effect.gen(function* () {
          if (!(yield* isCurrentInstallProcess)) return;
          const session = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
          if (!session || session.state.phase !== "installing") return;
          yield* finishInstall(
            tool,
            adapter,
            session.state,
            `Installer exited with code ${event.exitCode}.`,
          );
        }),
      );
    });

    // A hung installer must not pin this tool's slot forever: kill it and
    // report failure if it's still "installing" once the timeout elapses.
    Effect.runFork(
      Effect.gen(function* () {
        yield* Effect.sleep(installTimeout);
        if (!(yield* isCurrentInstallProcess)) return;
        const session = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
        if (!session || session.state.phase !== "installing") return;
        yield* Effect.sync(() => {
          try {
            process.kill();
          } catch {
            // best-effort — the process may already be gone
          }
        });
        // Store the failure rather than deleting the session. Deleting it made
        // the notified event and a subsequent read disagree: `stateForTool`
        // falls back to `runProbe` when there is no session, so a client that
        // polled after the timeout was told "idle"/not-connected instead of
        // "failed" — the timeout was announced once and then forgotten.
        //
        // Storing it does NOT pin the slot: `failed` is terminal per
        // `isTerminalPhase`, so `install()` and `spawnLoginProcess()` both
        // treat this session as replaceable and a retry spawns fresh.
        yield* applySessionUpdate(
          tool,
          timedOutInstallState(tool, Duration.format(installTimeout)),
          session.state,
        );
      }),
    );

    return initialState;
  });

  const install = Effect.fn("toolauth.install")(function* (tool: string) {
    const adapter = getAdapter(tool);
    const existing = (yield* SynchronizedRef.get(sessionsRef)).get(tool);
    // Already installing, or already mid-login (from a previous install()
    // or a direct start()) — join it rather than racing a second attempt.
    if (existing && !isTerminalPhase(existing.state.phase)) {
      return existing.state;
    }

    const binary = adapter.command[0]!;
    const alreadyPresent = yield* checkBinaryAvailable(binary);
    if (alreadyPresent) {
      // Nothing to install — go straight to the real sign-in flow, same as a
      // direct `start()` call.
      return yield* spawnLoginProcess(tool, adapter);
    }

    return yield* spawnInstallProcess(tool, adapter);
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

  const attachStream = (listener: (event: ToolAuthServiceStreamEvent) => Effect.Effect<void>) =>
    Effect.gen(function* () {
      const snapshot = yield* list;
      yield* listener({ type: "snapshot", tools: snapshot });
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    });

  return ToolAuthService.of({ list, start, install, submitCode, cancel, attachStream });
});

export const layer = Layer.effect(
  ToolAuthService,
  Effect.gen(function* () {
    const ptyAdapter = yield* PtyAdapter.PtyAdapter;
    return yield* makeWithOptions({ ptyAdapter });
  }),
).pipe(Layer.provide(ProcessRunner.layer));
