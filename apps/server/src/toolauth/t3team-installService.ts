/**
 * The install→login journey behind `ToolAuthService.install()`: "install this
 * CLI, then chain straight into sign-in" is a whole flow in its own right
 * (spawn the package manager, watch its output, re-probe, decide fail vs.
 * chain into the real login pty) — it only *shares* primitives with the
 * login flow in `t3team-ToolAuthService.ts`, not state, so it lives here as a
 * factory over those primitives instead of a closure inside that module.
 *
 * @module toolauth/installService
 */
import { ToolAuthSpawnError } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as SynchronizedRef from "effect/SynchronizedRef";

import * as PtyAdapter from "../terminal/PtyAdapter.ts";
import { getAdapter } from "./t3team-adapters.ts";
import { stripAnsi } from "./t3team-advance.ts";
import { buildNpmInstallArgv } from "./t3team-installCommand.ts";
import {
  appendInstallLog,
  extractInstallErrorMessage,
  isTerminalPhase,
  timedOutInstallState,
} from "./t3team-installFlow.ts";
import { getInstallPackage } from "./t3team-installPackages.ts";
import type { ActiveSession } from "./t3team-ToolAuthService.ts";
import type { AuthState, ToolAuthAdapter } from "./t3team-types.ts";

export interface ToolAuthInstallFlowDeps {
  readonly ptyAdapter: PtyAdapter.PtyAdapter["Service"];
  /** The same `SynchronizedRef` the login flow reads and writes — one session map per tool. */
  readonly sessionsRef: SynchronizedRef.SynchronizedRef<Map<string, ActiveSession>>;
  readonly notifyUpdate: (state: AuthState) => Effect.Effect<void>;
  readonly applySessionUpdate: (
    tool: string,
    nextState: AuthState,
    previousState: AuthState,
  ) => Effect.Effect<void>;
  readonly checkBinaryAvailable: (binary: string) => Effect.Effect<boolean>;
  /** The login flow's own spawn primitive — this is how a successful install chains into sign-in. */
  readonly spawnLoginProcess: (
    tool: string,
    adapter: ToolAuthAdapter,
  ) => Effect.Effect<AuthState, ToolAuthSpawnError>;
  readonly homeDir: string;
  readonly env: NodeJS.ProcessEnv;
  readonly installTimeout: Duration.Duration;
}

/**
 * Builds the install→login flow's public surface (`install`) from the
 * primitives `ToolAuthService.makeWithOptions` already closes over — mirrors
 * how `spawnLoginProcess` is the login side's own extracted primitive.
 */
export function makeToolAuthInstallFlow(deps: ToolAuthInstallFlowDeps) {
  const {
    ptyAdapter,
    sessionsRef,
    notifyUpdate,
    applySessionUpdate,
    checkBinaryAvailable,
    spawnLoginProcess,
    homeDir,
    env,
    installTimeout,
  } = deps;

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

    const process = yield* ptyAdapter
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

  return { install };
}
