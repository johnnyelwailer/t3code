/**
 * The self-contained page `t3_show_widget` publishes through upstream `HtmlRender.publish`
 * (the `html_render` path). Upstream's bootstrap supplies the live theme tokens, base styles,
 * link handling and content-height reporting; this document adds only the widget extras it
 * lacks: the no-network CSP, the icon sprite + `.t3w-icon` CSS, and a small layout reset.
 *
 * Widgets that drive the sendPrompt/callTool bridge are not published: upstream's
 * HtmlRenderFrame has no channel for it, so they stay on the web srcdoc path.
 */
import {
  buildT3TeamWidgetIconSprite,
  T3TEAM_WIDGET_ICON_CSS,
} from "@t3tools/shared/t3team-widgetIconSprite";

/** No remote network at all; scripts and styles are inline by construction, assets data: URIs. */
export const T3TEAM_WIDGET_HTML_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'";

/** Frame height requested at publish; clients shrink it to the page's measured content. */
export const T3TEAM_WIDGET_HTML_RENDER_DEFAULT_HEIGHT = 400;

// Upstream's base stylesheet sets the thread background, colors, fonts and body margin; keep
// the widget tier's box sizing, intrinsic media sizing and horizontal scroll for wide content.
const WIDGET_RESET_CSS = [
  "*,*::before,*::after{box-sizing:border-box}",
  "img,svg,video,canvas{max-width:100%;height:auto}",
  "body{overflow-x:auto}",
].join("");

/** Calls to these globals need the web srcdoc bridge, which HTML renders do not provide. */
const BRIDGE_GLOBAL_USE = /\bsendPrompt\b|\bcallTool\b/;

/** Whether a widget needs the sendPrompt/callTool bridge (and so the srcdoc path). */
export function t3teamWidgetNeedsBridge(input: {
  readonly widgetCode: string;
  readonly tools: ReadonlyArray<string>;
}): boolean {
  return input.tools.length > 0 || BRIDGE_GLOBAL_USE.test(input.widgetCode);
}

/** Wrap a validated html or svg fragment into the page published as an HTML render. */
export function buildT3TeamWidgetHtmlDocument(fragment: string): string {
  return [
    "<!DOCTYPE html>",
    '<html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${T3TEAM_WIDGET_HTML_CSP}">`,
    `<style>${WIDGET_RESET_CSS}${T3TEAM_WIDGET_ICON_CSS}</style>`,
    "</head><body>",
    buildT3TeamWidgetIconSprite(),
    fragment,
    "</body></html>",
  ].join("");
}
