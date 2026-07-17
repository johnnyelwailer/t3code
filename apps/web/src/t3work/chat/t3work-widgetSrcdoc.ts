/**
 * Builds the sandboxed iframe srcdoc for an ad-hoc widget attachment: current theme CSS
 * variables (light/dark aware — read from the live document), a minimal reset with a
 * transparent background, and the bridge script exposing `sendPrompt` and
 * `window.host.callTool` plus a ResizeObserver that reports content height. All bridge
 * postMessages carry the per-widget `nonce`; the parent additionally validates the source
 * window, and never evaluates strings received from the iframe.
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
  "--card",
  "--card-foreground",
  "--ring",
  "--font-sans",
  "--font-mono",
] as const;

/** Snapshot the app's custom properties so widgets can use `var(--...)`. */
export function collectT3workWidgetThemeCss(root?: HTMLElement): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "";
  }
  const element = root ?? document.documentElement;
  const computed = window.getComputedStyle(element);
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
  return `:root { ${declarations.join(" ")} color-scheme: inherit; }`;
}

const BRIDGE_SCRIPT = `
(function () {
  var nonce = document.currentScript.dataset.nonce;
  var pending = new Map();
  var callSeq = 0;
  function post(message) { window.parent.postMessage(message, "*"); }
  window.sendPrompt = function (text) {
    post({ type: "t3work-widget:send-prompt", nonce: nonce, text: String(text) });
  };
  window.host = {
    callTool: function (name, args) {
      callSeq += 1;
      var callId = "call-" + callSeq;
      return new Promise(function (resolve, reject) {
        pending.set(callId, { resolve: resolve, reject: reject });
        post({ type: "t3work-widget:call-tool", nonce: nonce, callId: callId, tool: String(name), arguments: args });
      });
    },
  };
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "t3work-widget:tool-result") return;
    var entry = pending.get(data.callId);
    if (!entry) return;
    pending.delete(data.callId);
    if (data.ok) entry.resolve(data.result);
    else entry.reject(new Error(typeof data.error === "string" ? data.error : "Tool call failed."));
  });
  function reportHeight() {
    var height = Math.ceil(document.documentElement.scrollHeight);
    post({ type: "t3work-widget:resize", nonce: nonce, height: height });
  }
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(reportHeight).observe(document.documentElement);
  }
  window.addEventListener("load", reportHeight);
  reportHeight();
})();
`;

export function buildT3workWidgetSrcdoc(input: {
  readonly html: string;
  readonly nonce: string;
  readonly themeCss: string;
}): string {
  const reset = [
    "*, *::before, *::after { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; background: transparent; }",
    "body { color: var(--foreground, inherit); font-family: var(--font-sans, system-ui, sans-serif); }",
    "img, svg, video, canvas { max-width: 100%; height: auto; }",
  ].join(" ");
  return [
    `<style>${input.themeCss} ${reset}</style>`,
    `<script data-nonce="${input.nonce}">${BRIDGE_SCRIPT}</script>`,
    input.html,
  ].join("\n");
}
