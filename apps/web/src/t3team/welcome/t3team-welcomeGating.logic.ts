import {
  FEATURE_FLAG_DEFINITIONS,
  type FeatureFlagKey,
} from "@t3tools/project-context/t3teamFeatureFlags";
import type { ServerConfig } from "@t3tools/contracts";

import type { FirstRunDecision } from "~/onboarding/firstRun.logic";

export const NEXI_WELCOME_SETUP_FLAG = "NEXI_WELCOME_SETUP" satisfies FeatureFlagKey;

/**
 * The welcome-setup generation this build shows once. Raise it when every user should see the
 * setup again, including those who already completed or skipped an earlier generation.
 */
export const NEXI_WELCOME_SEEN_VERSION = 1;

/** Whether /welcome should render the Nexi single-page setup instead of WelcomeWizard. */
export function isNexiWelcomeSetupEnabled(
  config: Pick<ServerConfig, "featureFlags"> | null | undefined,
): boolean {
  return (
    config?.featureFlags?.[NEXI_WELCOME_SETUP_FLAG] ??
    FEATURE_FLAG_DEFINITIONS[NEXI_WELCOME_SETUP_FLAG].defaultEnabled
  );
}

/** True when the user has already completed or skipped the current welcome-setup generation. */
export function hasSeenCurrentWelcome(seenVersion: number | undefined): boolean {
  return (seenVersion ?? 0) >= NEXI_WELCOME_SEEN_VERSION;
}

/** Records the current generation on the `t3team` client-settings namespace; no-ops when already set. */
export function withWelcomeSeenVersion<T extends { readonly welcomeSeenVersion?: number }>(
  t3team: T,
): T & { readonly welcomeSeenVersion: number } {
  if (hasSeenCurrentWelcome(t3team.welcomeSeenVersion)) {
    return t3team as T & { readonly welcomeSeenVersion: number };
  }
  return { ...t3team, welcomeSeenVersion: NEXI_WELCOME_SEEN_VERSION };
}

/**
 * First-run decision when the Nexi welcome setup is on. It keys only on the versioned seen flag,
 * so an existing project, a completed earlier onboarding, or section skips cannot suppress the
 * first show. Completion is written when the user finishes or skips, not here.
 */
export function resolveNexiWelcomeFirstRunDecision(input: {
  readonly hydrated: boolean;
  readonly seenVersion: number | undefined;
}): { readonly decision: FirstRunDecision; readonly persistCompletion: false } {
  if (!input.hydrated) {
    return { decision: "pending", persistCompletion: false };
  }
  if (hasSeenCurrentWelcome(input.seenVersion)) {
    return { decision: "app", persistCompletion: false };
  }
  return { decision: "wizard", persistCompletion: false };
}

/**
 * Whether the first-run gate may move the app to /welcome from `pathname`. Only the app's own
 * landing routes qualify, so a direct link (Settings, a thread) opens as asked and setup can
 * never lock anyone out. `/t3team` is where `/` lands in this distribution; it opens setup once
 * per app session, so coming back from a setup link does not bounce the user again.
 */
export function isWelcomeLandingPath(
  pathname: string,
  input: { readonly nexiWelcome: boolean; readonly alreadyOpened: boolean },
): boolean {
  if (pathname === "/") return true;
  return input.nexiWelcome && !input.alreadyOpened && pathname === "/t3team";
}
