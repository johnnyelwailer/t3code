/**
 * Controller for the inline widget block: builds the sandboxed srcdoc, validates bridge
 * postMessages (source window + per-widget nonce), tracks reported content height, and
 * services the two bridge verbs — sendPrompt (dispatches a normal user turn on the thread)
 * and callTool (POST /api/t3work/widget/tool-call; the server enforces the capability
 * allowlist through the tool broker). The parent handles only the fixed message types and
 * never evaluates strings from the iframe.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ScopedThreadRef,
  T3workMessageWidgetAttachment,
  T3workWidgetToolCallResponse,
} from "@t3tools/contracts";
import { CommandId, MessageId } from "@t3tools/contracts";

import { useBackend } from "~/t3work/backend/t3work-BackendContext";
import { useThread } from "~/state/entities";
import {
  buildT3workWidgetSrcdoc,
  collectT3workWidgetThemeCss,
} from "~/t3work/chat/t3work-widgetSrcdoc";

export const T3WORK_WIDGET_MIN_HEIGHT = 48;
export const T3WORK_WIDGET_MAX_HEIGHT = 640;

function randomNonce(): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useT3workWidgetBlockController(input: {
  readonly widget: T3workMessageWidgetAttachment["widget"];
  readonly threadRef: ScopedThreadRef | null;
}) {
  const { widget, threadRef } = input;
  const backend = useBackend();
  const thread = useThread(threadRef);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(T3WORK_WIDGET_MIN_HEIGHT);
  const nonce = useMemo(randomNonce, []);
  const srcdoc = useMemo(
    () =>
      buildT3workWidgetSrcdoc({
        html: widget.html,
        nonce,
        themeCss: collectT3workWidgetThemeCss(),
      }),
    [widget.html, nonce],
  );

  const sendPrompt = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!backend || !thread || !threadRef || trimmed.length === 0) return;
      await backend.dispatchCommand({
        type: "thread.turn.start",
        commandId: CommandId.make(`web:t3work-widget:turn:${randomNonce()}`),
        threadId: threadRef.threadId,
        message: {
          messageId: MessageId.make(randomNonce()),
          role: "user",
          text: trimmed,
          attachments: [],
        },
        modelSelection: thread.modelSelection,
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        createdAt: new Date().toISOString(),
      });
    },
    [backend, thread, threadRef],
  );

  const callTool = useCallback(
    async (call: { readonly callId: string; readonly tool: string; readonly args: unknown }) => {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      let outcome: T3workWidgetToolCallResponse;
      if (!threadRef) {
        outcome = { ok: false, error: "Widget thread is not available." };
      } else {
        try {
          const response = await fetch(
            `${backend?.httpBaseUrl ?? ""}/api/t3work/widget/tool-call`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                threadId: threadRef.threadId,
                widgetId: widget.widgetId,
                tool: call.tool,
                ...(call.args === undefined ? {} : { arguments: call.args }),
              }),
            },
          );
          outcome = (await response.json()) as T3workWidgetToolCallResponse;
        } catch {
          outcome = { ok: false, error: "Widget tool call failed to reach the server." };
        }
      }
      target.postMessage(
        {
          type: "t3work-widget:tool-result",
          callId: call.callId,
          ok: outcome.ok === true,
          ...(outcome.result === undefined ? {} : { result: outcome.result }),
          ...(outcome.error === undefined ? {} : { error: outcome.error }),
        },
        "*",
      );
    },
    [backend, threadRef, widget.widgetId],
  );

  const handleBridgeMessage = useCallback(
    (event: MessageEvent) => {
      const source = iframeRef.current?.contentWindow;
      if (!source || event.source !== source) return;
      const data = event.data as { readonly type?: unknown; readonly nonce?: unknown } | null;
      if (!data || typeof data.type !== "string" || data.nonce !== nonce) return;
      if (data.type === "t3work-widget:resize") {
        const raw = (data as { readonly height?: unknown }).height;
        if (typeof raw === "number" && Number.isFinite(raw)) {
          setHeight(
            Math.min(T3WORK_WIDGET_MAX_HEIGHT, Math.max(T3WORK_WIDGET_MIN_HEIGHT, Math.ceil(raw))),
          );
        }
        return;
      }
      if (data.type === "t3work-widget:send-prompt") {
        const text = (data as { readonly text?: unknown }).text;
        if (typeof text === "string") void sendPrompt(text);
        return;
      }
      if (data.type === "t3work-widget:call-tool") {
        const call = data as {
          readonly callId?: unknown;
          readonly tool?: unknown;
          readonly arguments?: unknown;
        };
        if (typeof call.callId === "string" && typeof call.tool === "string") {
          void callTool({ callId: call.callId, tool: call.tool, args: call.arguments });
        }
      }
    },
    [nonce, sendPrompt, callTool],
  );

  useEffect(() => {
    window.addEventListener("message", handleBridgeMessage);
    return () => window.removeEventListener("message", handleBridgeMessage);
  }, [handleBridgeMessage]);

  return { iframeRef, srcdoc, height, handleBridgeMessage };
}
