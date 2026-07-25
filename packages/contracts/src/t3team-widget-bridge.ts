import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * Widget bridge protocol (Epic 24 ad-hoc widget tier).
 *
 * Inside the sandboxed iframe a bridge script exposes `sendPrompt(text)` and
 * `window.host.callTool(name, args)`. Both talk to the parent via postMessage envelopes
 * carrying the per-widget `nonce` embedded in the srcdoc; the parent validates the source
 * window + nonce and handles only these fixed message types. Tool calls are forwarded to the
 * server over HTTP and dispatched through the t3team tool broker, gated by the widget's
 * persisted capability allowlist.
 */

/** postMessage envelope: iframe → parent. */
export const T3TeamWidgetBridgeRequest = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("t3team-widget:send-prompt"),
    nonce: TrimmedNonEmptyString,
    text: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("t3team-widget:call-tool"),
    nonce: TrimmedNonEmptyString,
    callId: TrimmedNonEmptyString,
    tool: TrimmedNonEmptyString,
    arguments: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    type: Schema.Literal("t3team-widget:resize"),
    nonce: TrimmedNonEmptyString,
    height: Schema.Number,
  }),
]);
export type T3TeamWidgetBridgeRequest = typeof T3TeamWidgetBridgeRequest.Type;

/** postMessage envelope: parent → iframe (tool-call settlement). */
export const T3TeamWidgetBridgeToolResult = Schema.Struct({
  type: Schema.Literal("t3team-widget:tool-result"),
  callId: TrimmedNonEmptyString,
  ok: Schema.Boolean,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.String),
});
export type T3TeamWidgetBridgeToolResult = typeof T3TeamWidgetBridgeToolResult.Type;

/** HTTP body for POST /api/t3team/widget/tool-call. */
export const T3TeamWidgetToolCallRequest = Schema.Struct({
  threadId: TrimmedNonEmptyString,
  widgetId: TrimmedNonEmptyString,
  tool: TrimmedNonEmptyString,
  arguments: Schema.optional(Schema.Unknown),
});
export type T3TeamWidgetToolCallRequest = typeof T3TeamWidgetToolCallRequest.Type;

/** HTTP response for POST /api/t3team/widget/tool-call. */
export const T3TeamWidgetToolCallResponse = Schema.Struct({
  ok: Schema.Boolean,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.String),
});
export type T3TeamWidgetToolCallResponse = typeof T3TeamWidgetToolCallResponse.Type;
