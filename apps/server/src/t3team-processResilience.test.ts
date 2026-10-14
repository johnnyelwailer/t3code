import { afterEach, describe, expect, it, vi } from "@effect/vitest";

import {
  installClosedIterableGuard,
  isClosedWriteIterableError,
  activeResourceSummary,
  summarizeResources,
  type ProcessLike,
} from "./t3team-processResilience.ts";

class WriteIterableClosedError extends Error {
  constructor() {
    super("WritableIterable is closed");
    this.name = "WriteIterableClosedError";
  }
}

type Event = "uncaughtException" | "unhandledRejection";

function fakeProcess() {
  const listeners: Record<Event, Array<(e: unknown) => void>> = {
    uncaughtException: [],
    unhandledRejection: [],
  };
  const exit = vi.fn();
  const proc = {
    on: (event: Event, fn: (e: unknown) => void) => listeners[event].push(fn),
    off: (event: Event, fn: (e: unknown) => void) => {
      listeners[event] = listeners[event].filter((l) => l !== fn);
    },
    listenerCount: (event: Event) => listeners[event].length,
    exit,
  } as unknown as ProcessLike;
  const emit = (event: Event, error: unknown) => {
    for (const l of listeners[event]) l(error);
  };
  return { proc, emit, exit, listeners };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isClosedWriteIterableError", () => {
  it("matches by name, message and cause chain", () => {
    expect(isClosedWriteIterableError(new WriteIterableClosedError())).toBe(true);
    expect(
      isClosedWriteIterableError(new Error("RetriableError: WritableIterable is closed")),
    ).toBe(true);
    expect(
      isClosedWriteIterableError(new Error("outer", { cause: new WriteIterableClosedError() })),
    ).toBe(true);
    expect(isClosedWriteIterableError(new Error("boom"))).toBe(false);
    expect(isClosedWriteIterableError(undefined)).toBe(false);
  });
});

describe("installClosedIterableGuard", () => {
  it("swallows the SDK error from rejections and exceptions", () => {
    const { proc, emit, exit } = fakeProcess();
    const onSwallowed = vi.fn();
    installClosedIterableGuard({ process: proc, onSwallowed });
    emit("unhandledRejection", new WriteIterableClosedError());
    emit("uncaughtException", new WriteIterableClosedError());
    expect(onSwallowed).toHaveBeenCalledTimes(2);
    expect(exit).not.toHaveBeenCalled();
  });

  it("keeps crash semantics for other errors", () => {
    const { proc, emit, exit } = fakeProcess();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    installClosedIterableGuard({ process: proc, onSwallowed: vi.fn() });
    emit("unhandledRejection", new Error("real bug"));
    emit("uncaughtException", new Error("real bug"));
    expect(exit).toHaveBeenCalledTimes(2);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("uninstalls cleanly", () => {
    const { proc, listeners } = fakeProcess();
    const uninstall = installClosedIterableGuard({ process: proc, onSwallowed: vi.fn() });
    uninstall();
    expect(listeners.uncaughtException).toHaveLength(0);
    expect(listeners.unhandledRejection).toHaveLength(0);
  });
});

describe("summarizeResources", () => {
  it("counts resources by kind", () => {
    expect(summarizeResources(["TCPWrap", "TCPWrap", "Timeout"])).toEqual({
      TCPWrap: 2,
      Timeout: 1,
    });
    expect(typeof activeResourceSummary()).toBe("object");
  });
});
