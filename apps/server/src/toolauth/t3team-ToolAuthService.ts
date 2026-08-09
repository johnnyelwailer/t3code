/**
 * ToolAuthService - composition root for the "Connected tools" sign-in
 * flows. Owns the shared session/notification state; wires in the login
 * flow (`t3team-loginService.ts`) and install→login chain
 * (`t3team-installService.ts`), which share those primitives, not state.
 * Consumes `PtyAdapter` rather than spawning its own process, so it's
 * trivially testable with a stubbed adapter.
 *
 * @module toolauth/ToolAuthService
 */
import { hasStateChanged } from "./t3team-advance.ts";
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
import { getAdapter, PRODUCTION_TOOLS } from "./t3team-adapters.ts";
import { makeToolAuthInstallFlow } from "./t3team-installService.ts";
import { makeToolAuthLoginFlow } from "./t3team-loginService.ts";
import { makeToolSingleFlight } from "./t3team-singleFlight.ts";
import { probeStatus } from "./t3team-status.ts";
import type { AuthState, ToolAuthAdapter } from "./t3team-types.ts";

/** Default cap on a single npm install — a hung installer must not pin the slot forever. */
const DEFAULT_INSTALL_TIMEOUT: Duration.Input = Duration.minutes(5);

export { ToolAuthNoActiveSessionError, ToolAuthNotAwaitingCodeError, ToolAuthSpawnError };

/** Internal counterpart of the wire `ToolAuthStreamEvent` — `tool` stays a plain string. */
export type ToolAuthServiceStreamEvent =
  | { readonly type: "snapshot"; readonly tools: ReadonlyArray<AuthState> }
  | { readonly type: "update"; readonly state: AuthState };

/** Shared session shape the login and install flows both read and write via `sessionsRef`. */
export interface ActiveSession {
  readonly adapter: ToolAuthAdapter;
  readonly process: PtyAdapter.PtyProcess;
  readonly state: AuthState;
}

/** ToolAuthService - Service tag for the "Connected tools" sign-in flows. */
export class ToolAuthService extends Context.Service<
  ToolAuthService,
  {
    /** Current state of every known tool — active session state wins over a fresh probe. */
    readonly list: Effect.Effect<ReadonlyArray<AuthState>>;
    /** Starts (or returns the already-running) sign-in flow for `tool`. */
    readonly start: (tool: string) => Effect.Effect<AuthState, ToolAuthSpawnError>;
    /**
     * One-click "install this CLI", chained straight into `start()` on a
     * successful re-probe (`t3team-installService.ts`). Joins an
     * already-running install or login flow instead of racing a second one.
     */
    readonly install: (tool: string) => Effect.Effect<AuthState, ToolAuthSpawnError>;
    /** Sends the human-pasted code back to the CLI. Only valid in `awaiting-code`. */
    readonly submitCode: (
      tool: string,
      code: string,
    ) => Effect.Effect<AuthState, ToolAuthNotAwaitingCodeError | ToolAuthNoActiveSessionError>;
    /** Kills any active session for `tool` and re-probes its connection status. */
    readonly cancel: (tool: string) => Effect.Effect<AuthState>;
    /** Emits a full snapshot, then live per-tool updates; returns an unsubscribe function. */
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
   * Test seam: decides whether `install()` skips straight to `start()`.
   * Defaults to a real `isCommandAvailable` PATH lookup; injectable so tests
   * don't depend on what's installed on the host (`fake`'s own command,
   * `node`, is always on PATH, which would otherwise make "not installed"
   * untestable).
   */
  readonly checkBinaryAvailable?: (binary: string) => Effect.Effect<boolean>;
  /** Test seam: caps a single install attempt. Defaults to 5 minutes. */
  readonly installTimeout?: Duration.Input;
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
  const installTimeout = Duration.fromInputUnsafe(
    options.installTimeout ?? DEFAULT_INSTALL_TIMEOUT,
  );
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

  const applySessionUpdate = Effect.fn("toolauth.applySessionUpdate")(function* (
    tool: string,
    nextState: AuthState,
    previousState: AuthState,
  ) {
    yield* SynchronizedRef.update(sessionsRef, (sessions) => {
      const existing = sessions.get(tool);
      if (!existing) return sessions;
      const next = new Map(sessions);
      next.set(tool, { ...existing, state: nextState });
      return next;
    });
    if (hasStateChanged(previousState, nextState)) {
      yield* notifyUpdate(nextState);
    }
  });

  // Login and install→login are each their own flow (t3team-loginService.ts,
  // t3team-installService.ts), sharing only the primitives above.
  // ONE claim set shared by both flows — see t3team-singleFlight.ts.
  const singleFlight = makeToolSingleFlight();

  const { spawnLoginProcess, start, submitCode, cancel } = makeToolAuthLoginFlow({
    ptyAdapter: options.ptyAdapter,
    sessionsRef,
    notifyUpdate,
    applySessionUpdate,
    stateForTool,
    homeDir,
    env,
    singleFlight,
  });

  const { install } = makeToolAuthInstallFlow({
    ptyAdapter: options.ptyAdapter,
    sessionsRef,
    notifyUpdate,
    applySessionUpdate,
    checkBinaryAvailable,
    spawnLoginProcess,
    homeDir,
    env,
    installTimeout,
    singleFlight,
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
