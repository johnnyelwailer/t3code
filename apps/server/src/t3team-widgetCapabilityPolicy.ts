/**
 * Per-format widget capability policy (Epic 24 trust gradient).
 *
 * A widget's runtime posture depends on how much validation its `format` passed. Raw
 * `html`/`svg` is the LEAST-validated tier (agent-authored markup rendered verbatim), so it
 * runs tightest: opaque-origin sandboxed iframe, CSP `connect-src 'none'` (no external
 * network), tool access only via an explicit `capabilities.tools` allowlist (empty by
 * default = no tools), and `sendPrompt` gated on a real user gesture + rate limited.
 *
 * The `mdx`/`tsx` tiers are documented here as FUTURE stubs only — they are not implemented
 * (the tool rejects them). They will be able to relax the posture precisely because they
 * pass validation/compile gates first (whitelisted first-party components for mdx; a
 * typechecked, registered React view for tsx). This module is the single seam where that
 * relaxation will live; today it only describes the html/svg reality.
 */

import type { T3TeamWidgetFormat } from "./t3team-widgetShowCore.ts";

export type WidgetNetworkPosture = "none" | "validated-inline" | "design-system";
export type WidgetSendPromptPosture = "gesture+ratelimit" | "trusted";

export interface WidgetCapabilityPolicy {
  readonly format: T3TeamWidgetFormat;
  /** Whether this tier is live today (html/svg) or a future stub (mdx/tsx). */
  readonly implemented: boolean;
  /** External network posture enforced by the renderer (CSP for the iframe tiers). */
  readonly network: WidgetNetworkPosture;
  /** Whether the runtime exposes `window.host.callTool` at all. */
  readonly callToolAllowed: boolean;
  /** Whether callable tools are limited to the widget's explicit `capabilities.tools`. */
  readonly callToolAllowlistOnly: boolean;
  /** How `sendPrompt` is gated. */
  readonly sendPrompt: WidgetSendPromptPosture;
  /** One-line rationale for the posture (surfaced in docs / future UI). */
  readonly rationale: string;
}

const HTML_SVG_POLICY = {
  implemented: true,
  network: "none",
  callToolAllowed: true,
  callToolAllowlistOnly: true,
  sendPrompt: "gesture+ratelimit",
  rationale:
    "Least-validated tier: agent-authored markup rendered verbatim in an opaque-origin sandboxed iframe, so it runs tightest.",
} as const satisfies Omit<WidgetCapabilityPolicy, "format">;

// FUTURE (not implemented): mdx passes a whitelisted first-party component gate, so it can
// render trusted components inline with a relaxed CSP. tsx compiles to a typechecked,
// registered React view, so it runs with full design-system access. Documented here as the
// seam for that relaxation; the tool still rejects these formats today.
const MDX_POLICY = {
  implemented: false,
  network: "validated-inline",
  callToolAllowed: true,
  callToolAllowlistOnly: true,
  sendPrompt: "gesture+ratelimit",
  rationale:
    "FUTURE: whitelisted first-party components pass a validation gate, so the posture can relax vs raw html.",
} as const satisfies Omit<WidgetCapabilityPolicy, "format">;

const TSX_POLICY = {
  implemented: false,
  network: "design-system",
  callToolAllowed: true,
  callToolAllowlistOnly: true,
  sendPrompt: "trusted",
  rationale:
    "FUTURE: compiled + typechecked registered view (highest trust), so it runs with full design-system access.",
} as const satisfies Omit<WidgetCapabilityPolicy, "format">;

export function resolveWidgetCapabilityPolicy(format: T3TeamWidgetFormat): WidgetCapabilityPolicy {
  switch (format) {
    case "html":
    case "svg":
      return { format, ...HTML_SVG_POLICY };
    case "mdx":
      return { format, ...MDX_POLICY };
    case "tsx":
      return { format, ...TSX_POLICY };
  }
}
