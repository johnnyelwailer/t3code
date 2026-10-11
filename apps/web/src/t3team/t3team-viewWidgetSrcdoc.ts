import { digestWidgetHtmlIssues } from "@t3tools/contracts";

/**
 * Sandboxed srcdoc for an agent-authored section on any view. The host passes the view's data
 * as `data`; the iframe has no tool bridge and the CSP blocks the network. My Work is the first
 * caller. Markup that names a network returns undefined so the caller can show a blocked state.
 */
const VIEW_WIDGET_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
  "img-src data:; font-src data:; connect-src 'none'";

const jsonForScript = (value: unknown): string => JSON.stringify(value).replaceAll("<", "\\u003c");

export function buildViewWidgetSrcdoc(input: {
  readonly html: string;
  readonly data: unknown;
  readonly themeCss: string;
}): string | undefined {
  if (digestWidgetHtmlIssues(input.html).length > 0) return undefined;
  return [
    `<meta http-equiv="Content-Security-Policy" content="${VIEW_WIDGET_CSP}">`,
    `<style>${input.themeCss} html,body{margin:0;background:transparent;color:var(--foreground,inherit)}</style>`,
    `<script>window.viewData=Object.freeze(${jsonForScript(input.data)});</script>`,
    input.html,
  ].join("\n");
}
