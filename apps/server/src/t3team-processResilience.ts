/**
 * Process-level resilience for the backend (fork-owned).
 *
 * 1. `@cursor/sdk` writes to an internal `WritableIterable` from fire-and-forget
 *    promises. When a run is cancelled or its transport closes while background
 *    jobs are still streaming, those writes reject with
 *    `WriteIterableClosedError: WritableIterable is closed` and nobody awaits
 *    them. Node's default `--unhandled-rejections=throw` then kills the whole
 *    backend (seen 2026-10-11, exit code 1). A write after close is harmless for
 *    us (the run is already over and its failure is reported through the SDK
 *    result), so the guard logs and drops exactly that error and keeps Node's
 *    crash-on-unhandled behaviour for everything else.
 * 2. `activeResourceSummary()` adds a cheap "what was in flight" snapshot to the
 *    existing stall profiler's warning (see `t3team-stallProfiler.ts`).
 */
import * as Effect from "effect/Effect";

const CLOSED_ITERABLE_ERROR_NAME = "WriteIterableClosedError";
const CLOSED_ITERABLE_MESSAGE = "WritableIterable is closed";

/** True for the SDK's write-after-close error, also when wrapped in `cause` chains. */
export function isClosedWriteIterableError(error: unknown, depth = 0): boolean {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return typeof error === "string" && error.includes(CLOSED_ITERABLE_MESSAGE);
  }
  const record = error as {
    readonly name?: unknown;
    readonly message?: unknown;
    readonly cause?: unknown;
  };
  if (record.name === CLOSED_ITERABLE_ERROR_NAME) return true;
  if (typeof record.message === "string" && record.message.includes(CLOSED_ITERABLE_MESSAGE)) {
    return true;
  }
  return record.cause !== undefined && isClosedWriteIterableError(record.cause, depth + 1);
}

export interface ProcessLike {
  on(event: "uncaughtException", listener: (error: Error) => void): unknown;
  on(event: "unhandledRejection", listener: (reason: unknown) => void): unknown;
  off(event: "uncaughtException", listener: (error: Error) => void): unknown;
  off(event: "unhandledRejection", listener: (reason: unknown) => void): unknown;
  listenerCount(event: "uncaughtException" | "unhandledRejection"): number;
  exit(code: number): never | void;
}

export interface ClosedIterableGuardOptions {
  readonly onSwallowed: (
    source: "uncaughtException" | "unhandledRejection",
    error: unknown,
  ) => void;
  /** Used for errors the guard does not own, to keep Node's crash semantics. */
  readonly onFatal?: (error: unknown) => void;
  readonly process?: ProcessLike;
}

/**
 * Installs the guard and returns an uninstall function. Errors other than the
 * SDK's write-after-close keep the default behaviour: if no other handler is
 * registered the process prints the error and exits with code 1, like Node does.
 */
export function installClosedIterableGuard(options: ClosedIterableGuardOptions): () => void {
  const proc = options.process ?? (process as unknown as ProcessLike);
  const fatal = (error: unknown) => {
    options.onFatal?.(error);
    if (proc.listenerCount("uncaughtException") > 1) return;
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    proc.exit(1);
  };
  const onException = (error: Error) => {
    if (isClosedWriteIterableError(error)) {
      options.onSwallowed("uncaughtException", error);
      return;
    }
    fatal(error);
  };
  const onRejection = (reason: unknown) => {
    if (isClosedWriteIterableError(reason)) {
      options.onSwallowed("unhandledRejection", reason);
      return;
    }
    if (proc.listenerCount("unhandledRejection") > 1) return;
    fatal(reason);
  };
  proc.on("uncaughtException", onException);
  proc.on("unhandledRejection", onRejection);
  return () => {
    proc.off("uncaughtException", onException);
    proc.off("unhandledRejection", onRejection);
  };
}

export function summarizeResources(names: ReadonlyArray<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of names) counts[name] = (counts[name] ?? 0) + 1;
  return counts;
}

/** Cheap snapshot of what is in flight (sockets, timers, fs requests), counted by kind. */
export function activeResourceSummary(): Record<string, number> {
  try {
    return summarizeResources(
      typeof process.getActiveResourcesInfo === "function" ? process.getActiveResourcesInfo() : [],
    );
  } catch {
    return {};
  }
}

let installed = false;

/**
 * Installs the closed-iterable guard once per process and routes its reports through
 * the Effect logger (server trace) of the fiber that installed it.
 */
export const installProcessResilience: Effect.Effect<void> = Effect.withFiber((fiber) => {
  if (installed) return Effect.void;
  installed = true;
  const log = (effect: Effect.Effect<void>): void => {
    Effect.runForkWith(fiber.context)(effect);
  };
  installClosedIterableGuard({
    onSwallowed: (source, error) =>
      log(
        Effect.logWarning("ignored @cursor/sdk write after its stream closed", {
          source,
          message: error instanceof Error ? error.message : String(error),
        }),
      ),
  });
  return Effect.void;
});
