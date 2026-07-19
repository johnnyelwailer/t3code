/**
 * Controller for the inline widget block: builds the sandboxed srcdoc, validates bridge
 * postMessages (source window + per-widget nonce), tracks reported content height, and
 * services the two bridge verbs — sendPrompt (dispatches a normal user turn on the thread)
 * and callTool (POST /api/t3work/widget/tool-call; the server enforces the capability
 * allowlist through the tool broker). The parent handles only the fixed message types and
 * never evaluates strings from the iframe. Pure limits/transport live in the bridge client.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScopedThreadRef, T3workMessageWidgetAttachment } from "@t3tools/contracts";
import { CommandId, MessageId } from "@t3tools/contracts";

import { useBackend } from "~/t3work/backend/t3work-BackendContext";
import { useThread } from "~/state/entities";
import {
  claimWidgetPromptSlot,
  isWidgetCallId,
  postWidgetToolCall,
  randomWidgetNonce,
  T3WORK_WIDGET_MAX_HEIGHT,
  T3WORK_WIDGET_MAX_INFLIGHT_CALLS,
  T3WORK_WIDGET_MIN_HEIGHT,
} from "~/t3work/chat/t3work-widgetBridgeClient";
import {
  buildT3workWidgetSrcdoc,
  collectT3workWidgetThemeCss,
} from "~/t3work/chat/t3work-widgetSrcdoc";

export {
  T3WORK_WIDGET_MAX_HEIGHT,
  T3WORK_WIDGET_MIN_HEIGHT,
} from "~/t3work/chat/t3work-widgetBridgeClient";

function humanizeWidgetTitle(title: string): string {
  return title.replaceAll(/[_-]+/g, " ").replaceAll(/\s+/g, " ").trim();
}

/** Build the hidden, agent-visible envelope for an explicit user action inside a widget. */
export function buildT3workWidgetPromptTransport(input: {
  readonly widgetId: string;
  readonly widgetTitle: string;
  readonly text: string;
}) {
  const widgetTitle = humanizeWidgetTitle(input.widgetTitle) || "Widget";
  return {
    text: `Widget “${widgetTitle}” action: ${input.text.trim()}`,
    t3workExt: {
      displayText: input.text.trim(),
      visibleToUser: false,
      visibleToAgent: true,
      widgetReply: { widgetId: input.widgetId, widgetTitle },
    },
  } as const;
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
  const nonce = useMemo(randomWidgetNonce, []);
  const srcdoc = useMemo(
    () =>
      buildT3workWidgetSrcdoc({
        html: widget.html,
        nonce,
        themeCss: collectT3workWidgetThemeCss(),
      }),
    [widget.html, nonce],
  );

  const inflightCallsRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const sendPrompt = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      // Rate limit: widget prompts are user-gesture-gated in the iframe, but cap the parent
      // side too (keyed by widgetId at module level so remounts cannot reset it) so a
      // compromised bridge cannot flood the thread; the gesture gate is the primary guard.
      if (!claimWidgetPromptSlot(widget.widgetId)) {
        console.warn(`[t3work-widget:${widget.widgetId}] sendPrompt dropped: rate limited.`);
        return;
      }
      if (!backend || !thread || !threadRef) return;
      const transport = buildT3workWidgetPromptTransport({
        widgetId: widget.widgetId,
        widgetTitle: widget.title,
        text: trimmed,
      });
      await backend.dispatchCommand({
        type: "thread.turn.start",
        commandId: CommandId.make(`web:t3work-widget:turn:${randomWidgetNonce()}`),
        threadId: threadRef.threadId,
        message: {
          messageId: MessageId.make(randomWidgetNonce()),
          role: "user",
          text: transport.text,
          attachments: [],
          t3workExt: transport.t3workExt,
        },
        modelSelection: thread.modelSelection,
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        createdAt: new Date().toISOString(),
      });
    },
    [backend, thread, threadRef, widget.widgetId, widget.title],
  );

  const callTool = useCallback(
    async (call: { readonly callId: string; readonly tool: string; readonly args: unknown }) => {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      let outcome;
      if (!threadRef) {
        outcome = { ok: false as const, error: "Widget thread is not available." };
      } else if (inflightCallsRef.current >= T3WORK_WIDGET_MAX_INFLIGHT_CALLS) {
        outcome = { ok: false as const, error: "Too many concurrent widget tool calls." };
      } else {
        abortRef.current ??= new AbortController();
        inflightCallsRef.current += 1;
        try {
          outcome = await postWidgetToolCall({
            httpBaseUrl: backend?.httpBaseUrl ?? "",
            threadId: threadRef.threadId,
            widgetId: widget.widgetId,
            tool: call.tool,
            args: call.args,
            signal: abortRef.current.signal,
          });
        } finally {
          inflightCallsRef.current -= 1;
        }
      }
      target.postMessage(
        {
          type: "t3work-widget:tool-result",
          nonce,
          callId: call.callId,
          ok: outcome.ok === true,
          ...(outcome.result === undefined ? {} : { result: outcome.result }),
          ...(outcome.error === undefined ? {} : { error: outcome.error }),
        },
        "*",
      );
    },
    [backend, threadRef, widget.widgetId, nonce],
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
        if (isWidgetCallId(call.callId) && typeof call.tool === "string") {
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

  // Abort in-flight widget tool calls when the block unmounts.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  return { iframeRef, srcdoc, height, handleBridgeMessage };
}
