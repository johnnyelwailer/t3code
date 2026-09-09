// @effect-diagnostics preferSchemaOverJson:off - test fixtures build raw JSON-RPC request bodies.
/**
 * Focused regressions for the legacy-name seam's fall-through semantics
 * (t3team-legacyToolNames.ts): the fallback must fire ONLY on the typed
 * request/read errors the normalization effect declares. Cancellation and
 * defects must propagate — a client disconnecting mid-read (or a bug) must
 * not be converted into a successful pass-through that the middleware then
 * dispatches. The full HTTP behavior (auth, routing, catalog) lives in
 * t3team-mcpHttp.test.ts; this file covers the seam's error channels.
 */
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import { HttpServerRequest } from "effect/unstable/http";

import { normalizeLegacyToolRequest } from "./t3team-legacyToolNames.ts";

// undici's Request requires duplex for stream bodies; the dom typings lag.
const postWithStreamBody = (stream: ReadableStream<Uint8Array>) =>
  new Request("http://127.0.0.1/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);

it.effect("typed read failure falls through to the original request", () =>
  Effect.gen(function* () {
    const failing = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new TypeError("simulated read failure"));
      },
    });
    const request = HttpServerRequest.fromWeb(postWithStreamBody(failing));

    const normalized = yield* normalizeLegacyToolRequest(request);

    // The unreadable original passes through untouched; the MCP transport's
    // own parse error applies downstream.
    expect(normalized).toBe(request);
  }),
);

it.effect("cancellation mid-read propagates as interruption, not a fallback", () =>
  Effect.gen(function* () {
    const hanging = new ReadableStream<Uint8Array>({ start() {} });
    const request = HttpServerRequest.fromWeb(postWithStreamBody(hanging));

    const fiber = yield* normalizeLegacyToolRequest(request).pipe(Effect.forkChild);
    yield* Effect.yieldNow;
    yield* Fiber.interrupt(fiber);
    const exit = yield* Fiber.await(fiber);

    // Under Effect.matchCause this exit would be a SUCCESS carrying the
    // original request — a client disconnect masquerading as a dispatchable
    // request. Typed-only catch must leave the interruption intact.
    expect(Exit.isSuccess(exit)).toBe(false);
    expect(Exit.hasInterrupts(exit)).toBe(true);
  }),
);

it.effect("legitimate rewrites still succeed", () =>
  Effect.gen(function* () {
    const body = new Request("http://127.0.0.1/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "t3team_models", arguments: {} },
      }),
    });
    const request = HttpServerRequest.fromWeb(body);

    const normalized = yield* normalizeLegacyToolRequest(request);

    expect(normalized).not.toBe(request);
    expect(normalized.method).toBe("POST");
    expect(yield* normalized.text).toContain('"name":"models"');
    expect(yield* normalized.text).toContain('"jsonrpc":"2.0"');
  }),
);
