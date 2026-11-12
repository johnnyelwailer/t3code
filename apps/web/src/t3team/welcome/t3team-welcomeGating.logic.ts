import {
  FEATURE_FLAG_DEFINITIONS,
  type FeatureFlagKey,
} from "@t3tools/project-context/t3teamFeatureFlags";
import type { ServerConfig } from "@t3tools/contracts";

export const NEXI_WELCOME_SETUP_FLAG = "NEXI_WELCOME_SETUP" satisfies FeatureFlagKey;

/** Whether /welcome should render the Nexi single-page setup instead of WelcomeWizard. */
export function isNexiWelcomeSetupEnabled(
  config: Pick<ServerConfig, "featureFlags"> | null | undefined,
): boolean {
  return (
    config?.featureFlags?.[NEXI_WELCOME_SETUP_FLAG] ??
    FEATURE_FLAG_DEFINITIONS[NEXI_WELCOME_SETUP_FLAG].defaultEnabled
  );
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
