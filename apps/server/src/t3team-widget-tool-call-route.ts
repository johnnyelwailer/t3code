/**
 * HTTP bridge for widget-initiated tool calls (`window.host.callTool` inside a sandboxed
 * widget iframe). The web bridge POSTs here; the call is dispatched through the t3team tool
 * broker only when the requested tool is in the widget's persisted capability allowlist AND
 * the tool is bound/visible for the owning thread. Fails closed on unknown widgets (e.g.
 * after a server restart) and enforces a per-call timeout.
 */

import { T3TeamWidgetToolCallRequest, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

import { browserApiCorsHeaders } from "./httpCors.ts";

import { errorResponse, okJson, readJsonBody, toAtlassianError } from "./t3team-atlassian-http.ts";
import { T3TEAM_MCP_SERVER_NAME, T3TeamToolBroker } from "./t3team-toolBroker.ts";
import { T3TeamWidgetRegistry } from "./t3team-widgetRegistry.ts";

const TOOL_CALL_TIMEOUT_MILLIS = 30_000;
/** Mirror of the client-side cap (t3team-useWidgetBlockController) on the serialized args. */
const MAX_ARGS_BYTES = 32 * 1024;

const decodeBody = Schema.decodeUnknownEffect(T3TeamWidgetToolCallRequest);
const encodeArgs = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const denied = (error: string) => okJson({ ok: false, error });

const badRequest = (error: string) =>
  HttpServerResponse.jsonUnsafe(
    { ok: false, error },
    { status: 400, headers: browserApiCorsHeaders },
  );

export const t3teamWidgetToolCallRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/widget/tool-call",
  Effect.gen(function* () {
    const registry = yield* T3TeamWidgetRegistry;
    const broker = yield* T3TeamToolBroker;
    const rawBody = yield* readJsonBody<unknown>();
    const decoded = yield* decodeBody(rawBody).pipe(Effect.result);
    if (decoded._tag === "Failure") {
      return badRequest("Invalid widget tool-call body.");
    }
    const { threadId, widgetId, tool } = decoded.success;
    const input = decoded.success;

    // Defense in depth: reject oversized argument payloads server-side too (the client caps
    // the same, but the route must not trust the client). Measured against the raw request
    // body's arguments — encode via the schema codec rather than a bare JSON.stringify.
    const argsBytes =
      input.arguments === undefined
        ? 0
        : new TextEncoder().encode(encodeArgs(input.arguments)).byteLength;
    if (argsBytes > MAX_ARGS_BYTES) {
      return badRequest("Widget tool call arguments exceed the 32 KB limit.");
    }

    // NOTE(auth): widgetId + threadId is the only credential here — acceptable under the
    // current local single-user deployment assumption (same trust domain as the rest of the
    // t3team HTTP routes). Any future multi-user or remote exposure MUST additionally bind
    // this call to the requesting session identity before dispatching.
    const registration = yield* registry.get(widgetId);
    if (!registration || registration.threadId !== threadId) {
      return denied(
        "Widget session is unknown or expired (widget tool access does not survive a server restart).",
      );
    }
    if (!registration.tools.includes(tool)) {
      return denied(`Tool '${tool}' is not in this widget's capability allowlist.`);
    }

    const binding = yield* broker.bindSession({ threadId: ThreadId.make(threadId) });
    if (!binding) {
      return denied("No tool binding is available for this thread.");
    }

    const result = yield* binding
      .callTool({
        server: T3TEAM_MCP_SERVER_NAME,
        tool,
        ...(input.arguments === undefined ? {} : { arguments: input.arguments }),
        threadId,
      })
      .pipe(
        Effect.timeout(TOOL_CALL_TIMEOUT_MILLIS),
        Effect.catch(() => Effect.succeed(undefined)),
      );
    if (!result) {
      return denied(`Tool '${tool}' timed out after ${TOOL_CALL_TIMEOUT_MILLIS / 1000}s.`);
    }
    if (result.isError === true) {
      const text = result.content[0]?.text ?? "Tool call failed.";
      return denied(text);
    }

    return okJson({ ok: true, result: result.structuredContent ?? null });
  }).pipe(
    Effect.mapError(toAtlassianError("Failed to dispatch widget tool call.")),
    Effect.catch(errorResponse),
  ),
);
