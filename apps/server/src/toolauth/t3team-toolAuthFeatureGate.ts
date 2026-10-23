/**
 * `INTEGRATIONS_TOOL_AUTH` for the Connected tools card: while it is off, `toolAuth.start` and
 * `toolAuth.install` answer a `failed` state naming the switch instead of spawning a CLI. `gh`
 * stays open: the GitHub account settings, the repository picker and the cloud-session sign-in
 * share its device flow, and none of them is the card. Read on every call.
 */
import {
  readFeatureFlag,
  type ReadFeatureFlagEnv,
} from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";

import { featureDisabledMessage } from "../t3team-featureFlagRoute.ts";
import type { AuthState } from "./t3team-types.ts";

const SHARED_SIGN_IN_TOOLS: ReadonlySet<string> = new Set(["gh"]);

export function isToolAuthFlowEnabled(tool: string, readEnv?: ReadFeatureFlagEnv): boolean {
  return SHARED_SIGN_IN_TOOLS.has(tool) || readFeatureFlag("INTEGRATIONS_TOOL_AUTH", readEnv);
}

export const whenToolAuthFlowEnabled = <E, R>(
  tool: string,
  flow: Effect.Effect<AuthState, E, R>,
): Effect.Effect<AuthState, E, R> =>
  Effect.suspend(() => {
    if (isToolAuthFlowEnabled(tool)) return flow;
    const refused: AuthState = {
      tool,
      phase: "failed",
      message: featureDisabledMessage("INTEGRATIONS_TOOL_AUTH"),
    };
    return Effect.succeed(refused);
  });
