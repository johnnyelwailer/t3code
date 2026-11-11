/**
 * `INTEGRATIONS_TOOL_AUTH` for the Connected tools card: while it is off, `toolAuth.start` and
 * `toolAuth.install` answer a `failed` state instead of spawning a CLI. `gh` stays open; its
 * device flow is shared by surfaces that are not the card. The refusal is a success value, so it
 * is also published on the status stream or a card reading only that stream sits at `idle`.
 */
import {
  readFeatureFlag,
  type ReadFeatureFlagEnv,
} from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";

import { featureDisabledMessage } from "../t3team-featureFlagRoute.ts";
import type { AuthState } from "./t3team-types.ts";

const SHARED_SIGN_IN_TOOLS: ReadonlySet<string> = new Set(["gh"]);

function isToolAuthFlowEnabled(tool: string, readEnv?: ReadFeatureFlagEnv): boolean {
  return SHARED_SIGN_IN_TOOLS.has(tool) || readFeatureFlag("INTEGRATIONS_TOOL_AUTH", readEnv);
}

/** The state every surface renders when the host's switch is off. Not stored as a session: a
 * retry after the switch is turned back on must start a real flow. */
export function toolAuthFeatureDisabledState(tool: string): AuthState {
  return {
    tool,
    phase: "failed",
    reason: "featureDisabled",
    message: featureDisabledMessage("INTEGRATIONS_TOOL_AUTH"),
  };
}

export interface ToolAuthFeatureGateOptions {
  /** Broadcasts the refusal to `subscribeToolAuth` subscribers. */
  readonly publish?: ((state: AuthState) => Effect.Effect<void>) | undefined;
  readonly readEnv?: ReadFeatureFlagEnv | undefined;
}

export const whenToolAuthFlowEnabled = <E, R>(
  tool: string,
  flow: Effect.Effect<AuthState, E, R>,
  options?: ToolAuthFeatureGateOptions,
): Effect.Effect<AuthState, E, R> =>
  Effect.suspend(() => {
    if (isToolAuthFlowEnabled(tool, options?.readEnv)) return flow;
    const refused = toolAuthFeatureDisabledState(tool);
    const publish = options?.publish;
    return publish === undefined
      ? Effect.succeed(refused)
      : publish(refused).pipe(Effect.as(refused));
  });
