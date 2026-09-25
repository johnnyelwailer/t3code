/**
 * Host-runtime read tools (`t3team.runtime.*` tools that take only JSON args
 * and read host state: provider plan limits, memory pressure). They share one
 * callback bag through the binding surface → dispatch → branch chain instead
 * of one named callback per tool.
 *
 * @module t3team-toolBrokerRuntimeReadTools
 */
import * as Effect from "effect/Effect";

import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult } from "./t3team-toolBrokerHelpers.ts";

export const T3TEAM_RUNTIME_READ_TOOL_IDS = [
  "t3team.runtime.provider_usage",
  "t3team.runtime.resource_pressure",
] as const;

export type T3TeamRuntimeReadToolId = (typeof T3TEAM_RUNTIME_READ_TOOL_IDS)[number];

export type T3TeamRuntimeReadTools = Readonly<
  Partial<
    Record<T3TeamRuntimeReadToolId, (toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>>
  >
>;

export const isT3TeamRuntimeReadTool = (tool: string): tool is T3TeamRuntimeReadToolId =>
  (T3TEAM_RUNTIME_READ_TOOL_IDS as ReadonlyArray<string>).includes(tool);

export function callT3TeamRuntimeReadTool(input: {
  readonly tool: T3TeamRuntimeReadToolId;
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly runtimeReadTools: T3TeamRuntimeReadTools | undefined;
}): Effect.Effect<T3TeamToolCallResult> {
  const handler = input.runtimeReadTools?.[input.tool];
  if (!handler) {
    return Effect.succeed(errorResult(`Tool '${input.tool}' is not enabled ${input.scopeLabel}.`));
  }
  return handler(input.toolArgs);
}
