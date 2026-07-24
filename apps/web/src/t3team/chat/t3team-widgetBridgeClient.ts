/**
 * Pure client-side helpers for the widget bridge (no React): the shared limits, nonce/callId
 * validators, the cross-remount prompt rate limiter, and the tool-call HTTP transport. Kept
 * out of the controller hook so both stay small and the transport is unit-testable on its own.
 */

import type { T3TeamWidgetToolCallResponse } from "@t3tools/contracts";

export const T3TEAM_WIDGET_MIN_HEIGHT = 48;
/** Pathological-content ceiling; normal widgets grow with their content so chat owns scrolling. */
export const T3TEAM_WIDGET_MAX_HEIGHT = 4_096;
/** Min interval between widget-originated prompts; excess is dropped with a warning. */
export const T3TEAM_WIDGET_PROMPT_INTERVAL_MS = 2_000;
/** Max concurrent in-flight callTool requests per widget; excess rejected immediately. */
export const T3TEAM_WIDGET_MAX_INFLIGHT_CALLS = 4;
/** Max UTF-8 byte size of the forwarded callTool request body. Mirrored server-side. */
export const T3TEAM_WIDGET_MAX_ARGS_BYTES = 32 * 1024;
/** The only callId shape the bridge emits; anything else is a forged/foreign message. */
const WIDGET_CALL_ID_PATTERN = /^call-\d+$/;

export function isWidgetCallId(value: unknown): value is string {
  return typeof value === "string" && WIDGET_CALL_ID_PATTERN.test(value);
}

export function randomWidgetNonce(): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Module-level so a remounting widget instance cannot reset its prompt rate limit. */
const promptLastSentAtByWidgetId = new Map<string, number>();

/** Returns true (and records now) if a prompt may be sent for this widget; false if rate-limited. */
export function claimWidgetPromptSlot(widgetId: string, now = Date.now()): boolean {
  const lastAt = promptLastSentAtByWidgetId.get(widgetId);
  if (lastAt !== undefined && now - lastAt < T3TEAM_WIDGET_PROMPT_INTERVAL_MS) return false;
  promptLastSentAtByWidgetId.set(widgetId, now);
  return true;
}

/** For tests: clear the cross-remount prompt limiter state. */
export function resetWidgetPromptLimiter(): void {
  promptLastSentAtByWidgetId.clear();
}

/** Build the request body, enforce the size cap, POST it, and normalize the outcome. */
export async function postWidgetToolCall(input: {
  readonly httpBaseUrl: string;
  readonly threadId: string;
  readonly widgetId: string;
  readonly tool: string;
  readonly args: unknown;
  readonly signal: AbortSignal;
}): Promise<T3TeamWidgetToolCallResponse> {
  const body = JSON.stringify({
    threadId: input.threadId,
    widgetId: input.widgetId,
    tool: input.tool,
    ...(input.args === undefined ? {} : { arguments: input.args }),
  });
  if (new TextEncoder().encode(body).byteLength > T3TEAM_WIDGET_MAX_ARGS_BYTES) {
    return { ok: false, error: "Widget tool call arguments exceed the 32 KB limit." };
  }
  try {
    const response = await fetch(`${input.httpBaseUrl}/api/t3team/widget/tool-call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: input.signal,
    });
    return (await response.json()) as T3TeamWidgetToolCallResponse;
  } catch {
    return { ok: false, error: "Widget tool call failed to reach the server." };
  }
}
