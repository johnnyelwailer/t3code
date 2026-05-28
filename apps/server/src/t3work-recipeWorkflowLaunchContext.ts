import * as Schema from "effect/Schema";
import {
  T3workActionRecipeContext,
  type T3workActionRecipeContext as T3workActionRecipeContextType,
} from "@t3tools/project-context";

import type { T3workTurnToolContext } from "./t3work-toolBroker.ts";

const isT3workActionRecipeContext = Schema.is(T3workActionRecipeContext);

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function readRecipeWorkflowLaunchContext(
  toolContext: T3workTurnToolContext | undefined,
): T3workActionRecipeContextType | undefined {
  const state = readRecord(toolContext?.state);
  const kickoff = readRecord(state?.kickoff);
  const workflow = readRecord(kickoff?.workflow);
  const launchContext = workflow?.launchContext;

  return isT3workActionRecipeContext(launchContext) ? launchContext : undefined;
}
