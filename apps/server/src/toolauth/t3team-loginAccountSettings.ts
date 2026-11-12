/** Account binary and config dir from provider-instance settings. instanceId wins; a unique instance is used when no id is given; several instances fall back to PATH. @module toolauth/loginAccountSettings */
import {
  ClaudeSettings,
  CodexSettings,
  ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceConfigMap,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { LoginAccountSettings } from "./t3team-loginAccount.ts";

const decodeClaudeSettings = Schema.decodeUnknownOption(ClaudeSettings);
const decodeCodexSettings = Schema.decodeUnknownOption(CodexSettings);

const DRIVER_FOR_TOOL: Readonly<Record<string, ProviderDriverKind>> = {
  claude: ProviderDriverKind.make("claudeAgent"),
  codex: ProviderDriverKind.make("codex"),
};

function driverMatches(tool: string, instance: ProviderInstanceConfig): boolean {
  const expected = DRIVER_FOR_TOOL[tool];
  return expected !== undefined && instance.driver === expected;
}

function settingsFromInstance(
  tool: string,
  instance: ProviderInstanceConfig,
  instanceId: string,
): LoginAccountSettings | undefined {
  if (!driverMatches(tool, instance)) return undefined;
  const raw = instance.config ?? {};
  if (tool === "claude") {
    const decoded = Option.getOrUndefined(decodeClaudeSettings(raw));
    if (decoded === undefined) return undefined;
    return {
      instanceId,
      binaryPath: decoded.binaryPath,
      homePath: decoded.homePath,
      instanceEnvironment: instance.environment,
    };
  }
  if (tool === "codex") {
    const decoded = Option.getOrUndefined(decodeCodexSettings(raw));
    if (decoded === undefined) return undefined;
    return {
      instanceId,
      binaryPath: decoded.binaryPath,
      homePath: decoded.homePath,
      instanceEnvironment: instance.environment,
    };
  }
  return undefined;
}

/** Pure lookup, easy to test without the settings service. */
export function loginAccountFromInstances(
  tool: string,
  instanceId: string | undefined,
  instances: ProviderInstanceConfigMap | undefined,
): LoginAccountSettings | undefined {
  if (instances === undefined) return undefined;
  if (instanceId !== undefined) {
    const instance = Object.hasOwn(instances, instanceId) ? instances[instanceId] : undefined;
    return instance === undefined ? undefined : settingsFromInstance(tool, instance, instanceId);
  }
  const matches = Object.entries(instances).filter(([, instance]) => driverMatches(tool, instance));
  if (matches.length !== 1) return undefined;
  const [id, instance] = matches[0]!;
  return settingsFromInstance(tool, instance, id);
}

/**
 * Production lookup. The settings module is loaded only when a sign-in
 * starts, so unit tests that import the login flow do not pull the server
 * settings graph. Missing `ServerSettingsService` is "no account configured"
 * — PATH fallback — not a failure.
 */
export const resolveLoginAccount = Effect.fn("toolauth.resolveLoginAccount")(function* (
  tool: string,
  instanceId: string | undefined,
): Effect.fn.Return<LoginAccountSettings | undefined> {
  // Dynamic import: a static one would load serverSettings into every toolauth test.
  const loaded = yield* Effect.tryPromise(() => import("../serverSettings.ts")).pipe(Effect.option);
  if (Option.isNone(loaded)) return undefined;
  const service = yield* Effect.serviceOption(loaded.value.ServerSettingsService);
  if (Option.isNone(service)) return undefined;
  const settings = yield* service.value.getSettings.pipe(Effect.option);
  if (Option.isNone(settings)) return undefined;
  return loginAccountFromInstances(tool, instanceId, settings.value.providerInstances);
});
