// @vitest-environment jsdom
/**
 * Inline widget block (show_widget ad-hoc tier):
 *   • renders the widget in a sandboxed iframe (allow-scripts only, no allow-same-origin)
 *     whose srcdoc carries the widget HTML, the bridge script, and the per-widget nonce;
 *   • bridge resize messages from the iframe's own window with the right nonce update the
 *     iframe height (clamped to the max); wrong-nonce or foreign-source messages are ignored;
 *   • the srcdoc builder injects theme variables, a transparent-background reset, and the
 *     sendPrompt / window.host.callTool globals.
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("~/state/entities", () => ({ useThread: () => null }));

import { T3workWidgetBlock } from "~/t3work/chat/t3work-widgetBlock";
import {
  T3WORK_WIDGET_MAX_HEIGHT,
  T3WORK_WIDGET_MIN_HEIGHT,
} from "~/t3work/chat/t3work-useWidgetBlockController";
import { buildT3workWidgetSrcdoc } from "~/t3work/chat/t3work-widgetSrcdoc";

const widget = {
  widgetId: "widget-1",
  title: "q4_revenue_chart",
  format: "html" as const,
  html: "<div id='chart'>hello widget</div>",
  capabilities: { tools: ["t3work.view.read"] },
  loadingMessages: ["Setting up the chart"],
};

let container: HTMLDivElement | null = null;
afterEach(() => {
  container?.remove();
  container = null;
});

function renderBlock() {
  container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<T3workWidgetBlock widget={widget} threadRef={null} />);
  });
  const iframe = container.querySelector("iframe");
  if (!iframe) throw new Error("iframe not rendered");
  return iframe;
}

function readNonce(iframe: HTMLIFrameElement): string {
  const match = /data-nonce="([^"]+)"/.exec(iframe.srcdoc);
  if (!match) throw new Error("nonce not embedded in srcdoc");
  return match[1]!;
}

function postBridgeMessage(source: Window | null, data: unknown) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", { data, source: source as MessageEventSource | null }),
    );
  });
}

describe("T3workWidgetBlock", () => {
  it("renders a sandboxed iframe with the widget code and nonce in srcdoc", () => {
    const iframe = renderBlock();
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.srcdoc).toContain("hello widget");
    expect(iframe.srcdoc).toContain("window.sendPrompt");
    expect(iframe.srcdoc).toContain("callTool");
    expect(readNonce(iframe).length).toBeGreaterThan(0);
    expect(iframe.style.height).toBe(`${T3WORK_WIDGET_MIN_HEIGHT}px`);
  });

  it("applies clamped resize messages from the iframe source with the right nonce", () => {
    const iframe = renderBlock();
    const nonce = readNonce(iframe);

    postBridgeMessage(iframe.contentWindow, {
      type: "t3work-widget:resize",
      nonce,
      height: 320,
    });
    expect(iframe.style.height).toBe("320px");

    postBridgeMessage(iframe.contentWindow, {
      type: "t3work-widget:resize",
      nonce,
      height: 10_000,
    });
    expect(iframe.style.height).toBe(`${T3WORK_WIDGET_MAX_HEIGHT}px`);
  });

  it("ignores messages with a wrong nonce or foreign source", () => {
    const iframe = renderBlock();
    const nonce = readNonce(iframe);

    postBridgeMessage(iframe.contentWindow, {
      type: "t3work-widget:resize",
      nonce: "spoofed",
      height: 500,
    });
    expect(iframe.style.height).toBe(`${T3WORK_WIDGET_MIN_HEIGHT}px`);

    postBridgeMessage(window, { type: "t3work-widget:resize", nonce, height: 500 });
    expect(iframe.style.height).toBe(`${T3WORK_WIDGET_MIN_HEIGHT}px`);
  });
});

describe("buildT3workWidgetSrcdoc", () => {
  it("injects theme css, transparent reset, bridge, and the raw fragment", () => {
    const srcdoc = buildT3workWidgetSrcdoc({
      html: "<svg viewBox='0 0 1 1'></svg>",
      nonce: "nonce-1",
      themeCss: ":root { --background: black; }",
    });
    expect(srcdoc).toContain("--background: black");
    expect(srcdoc).toContain("background: transparent");
    expect(srcdoc).toContain('data-nonce="nonce-1"');
    expect(srcdoc).toContain("t3work-widget:call-tool");
    expect(srcdoc).toContain("<svg viewBox='0 0 1 1'></svg>");
  });

  it("puts the CSP meta first with connect-src none and no external network", () => {
    const srcdoc = buildT3workWidgetSrcdoc({ html: "<div/>", nonce: "n", themeCss: "" });
    const cspIndex = srcdoc.indexOf('http-equiv="Content-Security-Policy"');
    const styleIndex = srcdoc.indexOf("<style>");
    const scriptIndex = srcdoc.indexOf("<script");
    expect(cspIndex).toBeGreaterThanOrEqual(0);
    // CSP must precede styles and the bridge script.
    expect(cspIndex).toBeLessThan(styleIndex);
    expect(cspIndex).toBeLessThan(scriptIndex);
    expect(srcdoc).toContain("connect-src 'none'");
    expect(srcdoc).toContain("default-src 'none'");
    expect(srcdoc).toContain("img-src data:");
  });

  it("gesture-gates sendPrompt and validates tool-result source + nonce in the bridge", () => {
    const srcdoc = buildT3workWidgetSrcdoc({ html: "<div/>", nonce: "n", themeCss: "" });
    // sendPrompt requires a live user activation.
    expect(srcdoc).toContain("navigator.userActivation");
    expect(srcdoc).toContain("isActive");
    // tool-result listener validates it came from the parent AND carries the nonce.
    expect(srcdoc).toContain("event.source !== window.parent");
    expect(srcdoc).toContain("data.nonce !== nonce");
  });
});

describe("widget bridge client", () => {
  it("rate-limits prompts per widget and rejects excess", async () => {
    const { claimWidgetPromptSlot, resetWidgetPromptLimiter } =
      await import("~/t3work/chat/t3work-widgetBridgeClient");
    resetWidgetPromptLimiter();
    expect(claimWidgetPromptSlot("w", 1_000)).toBe(true);
    // Within the 2s window → dropped.
    expect(claimWidgetPromptSlot("w", 1_500)).toBe(false);
    // A different widget is independent.
    expect(claimWidgetPromptSlot("other", 1_500)).toBe(true);
    // After the window elapses → allowed again.
    expect(claimWidgetPromptSlot("w", 4_000)).toBe(true);
  });

  it("only accepts callIds of the form call-<n>", async () => {
    const { isWidgetCallId } = await import("~/t3work/chat/t3work-widgetBridgeClient");
    expect(isWidgetCallId("call-1")).toBe(true);
    expect(isWidgetCallId("call-42")).toBe(true);
    expect(isWidgetCallId("evil")).toBe(false);
    expect(isWidgetCallId("call-")).toBe(false);
    expect(isWidgetCallId(42)).toBe(false);
  });

  it("rejects oversized tool-call args before hitting the network", async () => {
    const { postWidgetToolCall } = await import("~/t3work/chat/t3work-widgetBridgeClient");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const outcome = await postWidgetToolCall({
      httpBaseUrl: "",
      threadId: "t1",
      widgetId: "w1",
      tool: "t3work.view.read",
      args: { blob: "x".repeat(33 * 1024) },
      signal: new AbortController().signal,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("32 KB");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
