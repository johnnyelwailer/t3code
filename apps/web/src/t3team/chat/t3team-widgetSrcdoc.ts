/**
 * Builds the sandboxed iframe srcdoc for an ad-hoc widget attachment: current theme CSS
 * variables (light/dark aware — read from the live document), a minimal reset with a
 * transparent background, and the bridge script exposing `sendPrompt` and
 * `window.host.callTool` plus a ResizeObserver that reports content height. All bridge
 * postMessages carry the per-widget `nonce`; the parent additionally validates the source
 * window, and never evaluates strings received from the iframe.
 */

import { buildT3TeamWidgetIconSprite, T3TEAM_WIDGET_ICON_CSS } from "./t3team-widgetIconSprite.ts";
import { normalizeT3TeamWidgetHtml, T3TEAM_WIDGET_HOST_CSS } from "./t3team-widgetHtmlStyle.ts";
import { DEFAULT_SANS_FONT_STACK } from "~/appearanceFonts";

/**
 * Theme tokens a widget may rely on. Every one is also snapshotted from the live document, so the
 * list is the *documented contract* (what authoring guidance promises), not the only thing copied:
 * a theme pack adding tokens (Epic 37) still reaches widgets automatically.
 */
const FALLBACK_THEME_VARIABLES = [
  "--background",
  "--foreground",
  "--muted",
  "--muted-foreground",
  "--border",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--input",
  "--ring",
  // Status tokens from the Epic 37 semantic vocabulary. These are what replaces a ✅/⚠️/⛔ glyph:
  // a real icon in `var(--success)` / `var(--warning)` / `var(--destructive)`.
  "--info",
  "--info-foreground",
  "--success",
  "--success-foreground",
  "--warning",
  "--warning-foreground",
  "--radius",
  "--font-sans",
  "--font-mono",
] as const;

/** The documented widget theme-token contract, in the order authoring guidance lists it. */
export const T3TEAM_WIDGET_THEME_TOKENS: ReadonlyArray<string> = FALLBACK_THEME_VARIABLES;

/** Snapshot the app's custom properties so widgets can use `var(--...)`. */
export function collectT3TeamWidgetThemeCss(root?: HTMLElement): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "";
  }
  const element = root ?? document.documentElement;
  const computed = window.getComputedStyle(element);
  const colorScheme = computed.colorScheme.includes("dark") ? "dark" : "light";
  const names = new Set<string>(FALLBACK_THEME_VARIABLES);
  for (let index = 0; index < computed.length; index += 1) {
    const name = computed.item(index);
    if (name.startsWith("--")) names.add(name);
  }
  const declarations: string[] = [];
  for (const name of names) {
    const value = computed.getPropertyValue(name).trim();
    if (value.length > 0) declarations.push(`${name}: ${value};`);
  }
  return `:root { ${declarations.join(" ")} color-scheme: ${colorScheme}; }`;
}

const BRIDGE_SCRIPT = `
(function () {
  var nonce = document.currentScript.dataset.nonce;
  var pending = new Map();
  var callSeq = 0;
  function post(message) { window.parent.postMessage(message, "*"); }
  window.sendPrompt = function (text) {
    // Gesture gate: only forward prompts backed by a real user activation inside the
    // widget (click/keypress), so widget scripts cannot autonomously drive the thread.
    var activation = navigator.userActivation;
    if (!activation || !activation.isActive) {
      console.warn("[t3team-widget] sendPrompt dropped: requires a user gesture.");
      return;
    }
    post({ type: "t3team-widget:send-prompt", nonce: nonce, text: String(text) });
  };
  window.host = {
    callTool: function (name, args) {
      callSeq += 1;
      var callId = "call-" + callSeq;
      return new Promise(function (resolve, reject) {
        pending.set(callId, { resolve: resolve, reject: reject });
        post({ type: "t3team-widget:call-tool", nonce: nonce, callId: callId, tool: String(name), arguments: args });
      });
    },
  };
  window.addEventListener("message", function (event) {
    // Only the embedding host may settle tool calls, and only with the per-widget nonce — a
    // nested third-party iframe inside the widget could otherwise forge tool results.
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.type !== "t3team-widget:tool-result" || data.nonce !== nonce) return;
    var entry = pending.get(data.callId);
    if (!entry) return;
    pending.delete(data.callId);
    if (data.ok) entry.resolve(data.result);
    else entry.reject(new Error(typeof data.error === "string" ? data.error : "Tool call failed."));
  });
  function reportHeight() {
    var height = Math.ceil(document.documentElement.scrollHeight);
    post({ type: "t3team-widget:resize", nonce: nonce, height: height });
  }
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(reportHeight).observe(document.documentElement);
  }
  window.addEventListener("load", reportHeight);
  reportHeight();
})();
`;

export function buildT3TeamWidgetSrcdoc(input: {
  readonly html: string;
  readonly nonce: string;
  readonly themeCss: string;
}): string {
  const reset = [
    "*, *::before, *::after { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; background: transparent; }",
    // `--font-sans` is always present in `input.themeCss` (see `FALLBACK_THEME_VARIABLES` in
    // `collectT3TeamWidgetThemeCss`), so this fallback is a belt-and-braces default rather than
    // the common path. It intentionally matches `DEFAULT_SANS_FONT_STACK` (apps/web's own
    // `--font-sans` default in index.css) instead of a generic `system-ui, sans-serif`: the app
    // ships no self-hosted webfont at all — every font on every platform this app runs on is a
    // system font matched by name, which resolves identically inside a sandboxed `srcdoc` iframe
    // as outside one (the CSP's `font-src` only gates `@font-face url()` loading, which system
    // fonts never use). There is therefore no font ASSET here to embed as a `data:` URI; keeping
    // this fallback byte-for-byte the same stack is what actually keeps a widget
    // metric-compatible with the host app if the theme snapshot is ever unavailable.
    `body { color: var(--foreground, inherit); font-family: var(--font-sans, ${DEFAULT_SANS_FONT_STACK}); }`,
    "img, svg, video, canvas { max-width: 100%; height: auto; }",
    T3TEAM_WIDGET_ICON_CSS,
  ].join(" ");
  // CSP first: no external network at all (postMessage is unaffected by connect-src);
  // scripts/styles are inline by construction, assets must be data: URIs.
  const csp =
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
    "img-src data:; font-src data:; connect-src 'none'";
  return [
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<style>${input.themeCss} ${reset}</style>`,
    `<script data-nonce="${input.nonce}">${BRIDGE_SCRIPT}</script>`,
    // Host-injected so referencing an icon costs the author nothing against the widget_code cap.
    buildT3TeamWidgetIconSprite(),
    normalizeT3TeamWidgetHtml(input.html),
    // Keep this after the persisted fragment: it is the host's narrow last line of defence for
    // stale author CSS, while the normalizer above also covers inline declarations.
    `<style data-t3team-widget-host>${T3TEAM_WIDGET_HOST_CSS}</style>`,
  ].join("\n");
}
