/**
 * Canonical widget-authoring guidance for `t3team.widget.show` / `thread.showWidget` —
 * the single source of truth for how an agent must build a themed, responsive,
 * accessible widget body: use the host theme CSS variables for all colors, use the
 * host icon sprite instead of emoji, keep layouts compact and fluid, and respect the
 * sandbox's CSP.
 *
 * Two surfaces need this exact text and must not restate it:
 * - the `t3team.widget.show` MCP tool's `widget_code` input schema
 *   ({@link ./t3teamToolCatalogImplemented.ts}), locked by
 *   `t3teamWidgetGuidance.test.ts`.
 * - the agent-orchestration manual's `thread.showWidget` entry
 *   (`apps/server/src/t3team-workflowManual.ts`) via its `t3team_help("widget-guidance")`
 *   topic (`apps/server/src/t3team-help.ts`) — that path calls `thread.showWidget`
 *   directly instead of going through the MCP tool catalog, so it never saw this text
 *   before this constant existed.
 *
 * Both import this constant instead of copy-pasting the guidance, so there is exactly
 * one place to change it.
 *
 * @module t3teamWidgetGuidance
 */
export const T3TEAM_WIDGET_AUTHORING_GUIDANCE =
  'Raw SVG (starting with <svg>) or an HTML fragment. Do NOT include <!DOCTYPE>, <html>, <head>, or <body> tags. The widget renders in a sandboxed iframe with the live app theme. Use the provided variables for ALL colors: var(--background), var(--foreground), var(--card), var(--card-foreground), var(--muted), var(--muted-foreground), var(--border), var(--primary), var(--primary-foreground), var(--secondary), var(--secondary-foreground), var(--accent), var(--accent-foreground), var(--destructive), var(--ring), var(--popover), var(--input), and the status tokens var(--info), var(--success), var(--warning) (each with a matching -foreground). Use var(--font-sans) / var(--font-mono) for typography and var(--radius) for corners. Never hard-code light or dark palette colors; the same markup must remain readable in both modes. Build mobile-first and fluid: use width:100% and the available host width, avoid fixed card widths/max-widths that leave a narrow mobile card on desktop, and adapt dense layouts with container or media queries. Keep content compact and use progressive disclosure/collapsible details; the host auto-sizes to content so chat owns scrolling. Use internal scrolling only for intrinsically large tables or logs. Keep the outer background transparent and add no top-level padding. For icons, use the host-injected sprite instead of emoji or Unicode pictograms: <svg class="t3w-icon" aria-hidden="true"><use href="#t3w-icon-NAME" /></svg>, adding class t3w-icon-lg for 20px. Available NAME values: arrow-right, ban, calendar, check, chevron-down, chevron-right, circle-alert, circle-check, circle-dot, circle-x, clock, external-link, file-text, git-pull-request, info, list, loader-circle, minus, plus, search, shield, sparkles, trending-down, trending-up, triangle-alert, user, x. They draw in currentColor, so set color (e.g. color: var(--success)) on the icon or its container — use circle-check/triangle-alert/circle-x instead of the check, warning and blocked emoji. Hand-written inline SVG using currentColor at 16px or 20px is fine for anything the sprite lacks; never depend on an external icon library. Scripts are allowed, but a strict CSP blocks ALL external network access (no fetch/XHR/WebSockets, no CDN scripts, no remote images/fonts) — inline all CSS/JS and embed assets as data: URIs. Globals inside the widget: sendPrompt(text) starts a hidden, agent-visible turn from a real user gesture (it does not answer workflow askUser prompts and is rate-limited); window.host.callTool(name, args) returns a Promise with a broker tool result, but only for tools declared in capabilities.tools.';
