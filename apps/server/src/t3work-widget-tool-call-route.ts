/**
 * HTTP bridge for widget-initiated tool calls (`window.host.callTool` inside a sandboxed
 * widget iframe). The web bridge POSTs here; the call is dispatched through the t3work tool
 * broker only when the requested tool is in the widget's persisted capability allowlist AND
 * the tool is bound/visible for the owning thread. Fails closed on unknown widgets (e.g.
 * after a server restart) and enforces a per-call timeout.
 */

import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3workAtlassianError,
  toAtlassianError,
} from "./t3work-atlassian-http.ts";
import { T3WORK_MCP_SERVER_NAME, T3workToolBroker } from "./t3work-toolBroker.ts";
import { T3workWidgetRegistry } from "./t3work-widgetRegistry.ts";

const TOOL_CALL_TIMEOUT_MILLIS = 30_000;

type T3workWidgetToolCallBody = {
  readonly threadId?: string;
  readonly widgetId?: string;
  readonly tool?: string;
  readonly arguments?: unknown;
};

const denied = (error: string) => okJson({ ok: false, error });

export const t3workWidgetToolCallRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/widget/tool-call",
  Effect.gen(function* () {
    const registry = yield* T3workWidgetRegistry;
    const broker = yield* T3workToolBroker;
    const input = yield* readJsonBody<T3workWidgetToolCallBody>();

    const threadId = input.threadId?.trim() ?? "";
    const widgetId = input.widgetId?.trim() ?? "";
    const tool = input.tool?.trim() ?? "";
    if (threadId.length === 0 || widgetId.length === 0 || tool.length === 0) {
      return yield* new T3workAtlassianError({
        message: "threadId, widgetId, and tool are required.",
      });
    }

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
        server: T3WORK_MCP_SERVER_NAME,
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
