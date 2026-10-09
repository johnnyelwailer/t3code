/**
 * Intent → builder/authoring seam for `t3team.widget.show` / `thread.showWidget`
 * (design intent PJ 2026-08-29, Epic 24 widget composition default).
 *
 * Flow: intent → builder subagent → widgetCode → format routing (html shim | widget tier).
 * Raw `widget_code` bypasses this module entirely (required for deterministic workflow replay).
 *
 * The full builder loop (reuse-check → draft → typecheck → preview via HtmlRender → fix) is
 * not wired to a model in this change-set; callers that pass only `intent` get a clear error
 * until the subagent lands. Do not invent placeholder HTML here.
 */

import * as Effect from "effect/Effect";

import type { T3TeamWidgetFormat, T3TeamWidgetShowInput } from "./t3team-widgetShowCore.ts";

export const T3TEAM_WIDGET_BUILDER_UNAVAILABLE =
  "Widget builder subagent is not connected yet. Pass widget_code to skip the builder " +
  "(required for deterministic workflow replay), or retry once intent authoring is available.";

/** True when the caller supplied raw widget code and should skip the builder. */
export function shouldBypassBuilder(parsed: Pick<T3TeamWidgetShowInput, "widgetCode">): boolean {
  return parsed.widgetCode.length > 0;
}

export interface AuthorWidgetFromIntentInput {
  readonly intent: string;
  readonly title: string;
  readonly format: T3TeamWidgetFormat;
}

export interface AuthorWidgetFromIntentResult {
  readonly widgetCode: string;
  readonly format: T3TeamWidgetFormat;
}

/**
 * Author widget markup from an intent. Until the builder subagent is wired, this always
 * fails with {@link T3TEAM_WIDGET_BUILDER_UNAVAILABLE} — never invents HTML.
 */
export function authorWidgetFromIntent(
  _input: AuthorWidgetFromIntentInput,
): Effect.Effect<AuthorWidgetFromIntentResult, string> {
  return Effect.fail(T3TEAM_WIDGET_BUILDER_UNAVAILABLE);
}
