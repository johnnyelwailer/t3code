/**
 * `launchThread`: top-level threads a workflow launches and keeps addressing (PR watch's one
 * thread per pull request). Unlike `spawnThread` children they are not subagents of the run's
 * launch thread: they show in the sidebar as ordinary threads, can watch a pull request, and
 * outlive the run that launched them.
 *
 * Identity is the author's `key`: the host derives the thread id from the project, the recipe and
 * the key, so the same key returns the same thread on replay, in a later pass, after a restart
 * and in a later run of the same recipe. Every verb is a journaled request the host settles before
 * `send` returns, so a replay reads the recorded answer instead of asking again. A host refusal
 * (a mode above the run's, a watch after the user's Stop) is journaled as an answer too and
 * thrown as a `LaunchedThreadError`, the same on every replay.
 *
 * Gated by the `"launch"` capability, checked at the call site like `"schedule"`.
 */
import type { MessageBroker } from "./t3team-sdk.broker.ts";
import { fromRun } from "./t3team-sdk.engineApi.ts";
import { PermissionDeniedError } from "./t3team-sdk.errors.ts";
import type { HandleDispatch } from "./t3team-sdk.handles.ts";
import type {
  LaunchedThread,
  LaunchedThreadPrimitives,
  LaunchedThreadState,
  LaunchThreadOpts,
} from "./t3team-sdk.launchedThreadTypes.ts";

export const LAUNCH_THREAD_KIND = "thread.launch" as const;
export const LAUNCHED_THREAD_KIND = "thread.launched" as const;
export const RUN_FACTS_KIND = "run.facts" as const;
type LaunchKind = typeof LAUNCH_THREAD_KIND | typeof LAUNCHED_THREAD_KIND | typeof RUN_FACTS_KIND;

/** A host refusal of a launched-thread verb, journaled and re-thrown identically on replay. */
export class LaunchedThreadError extends Error {
  readonly _tag = "LaunchedThreadError" as const;
  constructor(message: string) {
    super(message);
    this.name = "LaunchedThreadError";
  }
}

/** What the host settles each verb with. */
type HostAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export type LaunchedThreadOp =
  | { readonly op: "watch"; readonly url: string; readonly watching: boolean }
  | { readonly op: "send"; readonly text: string }
  | { readonly op: "configure"; readonly model?: unknown; readonly runtimeMode?: string }
  | { readonly op: "read" }
  | { readonly op: "facts"; readonly extensions: Readonly<Record<string, unknown>> };

export function createLaunchedThreadPrimitives(deps: {
  readonly dispatch: HandleDispatch;
  readonly broker: MessageBroker;
  readonly capabilities: ReadonlySet<string>;
}): LaunchedThreadPrimitives {
  const ask = async <T>(kind: LaunchKind, refId: string, payload: object): Promise<T> => {
    const correlationId = await deps.dispatch.send({
      kind,
      refId,
      args: payload,
      fire: (cid, resolver) => deps.broker.send({ correlationId: cid, kind, payload }, resolver),
    });
    const answer = await deps.dispatch.awaitResolution<HostAnswer<T>>(correlationId, undefined);
    if (!answer.ok) throw new LaunchedThreadError(answer.error);
    return answer.value;
  };

  const handle = (threadId: string, key: string, created: boolean): LaunchedThread => {
    const op = <T>(body: LaunchedThreadOp) =>
      ask<T>(LAUNCHED_THREAD_KIND, body.op, { threadId, key, ...body });
    return Object.freeze({
      id: threadId,
      key,
      created,
      watchPullRequest: (url: string, watching = true) => op<void>({ op: "watch", url, watching }),
      send: (text: string) => op<void>({ op: "send", text }),
      configure: (opts: Parameters<LaunchedThread["configure"]>[0]) =>
        op<void>({
          op: "configure",
          ...(opts.model === undefined ? {} : { model: opts.model }),
          ...(opts.runtimeMode === undefined ? {} : { runtimeMode: opts.runtimeMode }),
        }),
      read: () => op<LaunchedThreadState>({ op: "read" }),
      setFacts: (extensions: Readonly<Record<string, unknown>>) =>
        op<void>({ op: "facts", extensions }),
    });
  };

  const launchThread = async (opts: LaunchThreadOpts): Promise<LaunchedThread> => {
    if (!deps.capabilities.has("launch")) {
      throw new PermissionDeniedError(
        "'launchThread' requires the 'launch' capability. Add 'launch' to this workflow's meta.capabilities.",
      );
    }
    if (typeof opts.key !== "string" || opts.key.trim().length === 0) {
      throw new LaunchedThreadError("launchThread needs a non-empty key.");
    }
    const launched = await ask<{ readonly threadId: string; readonly created: boolean }>(
      LAUNCH_THREAD_KIND,
      opts.key,
      { ...opts, key: opts.key.trim() },
    );
    return handle(launched.threadId, opts.key.trim(), launched.created);
  };

  const setRunFacts = (extensions: Readonly<Record<string, unknown>>) =>
    ask<void>(RUN_FACTS_KIND, "run.facts", { extensions });

  return { launchThread, setRunFacts };
}

// --- Engine API (imported form) ------------------------------------------------
/** Launch (or find, by key) a top-level thread this run addresses. Requires `"launch"`. */
export function launchThread(opts: LaunchThreadOpts): Promise<LaunchedThread> {
  return fromRun<LaunchedThreadPrimitives["launchThread"]>("launchThread")(opts);
}

/** Merge `extensions` facts on this run's own launch thread (a recipe card's summary). */
export function setRunFacts(extensions: Readonly<Record<string, unknown>>): Promise<void> {
  return fromRun<LaunchedThreadPrimitives["setRunFacts"]>("setRunFacts")(extensions);
}
