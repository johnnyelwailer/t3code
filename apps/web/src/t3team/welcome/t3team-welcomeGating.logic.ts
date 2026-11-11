import {
  FEATURE_FLAG_DEFINITIONS,
  type FeatureFlagKey,
} from "@t3tools/project-context/t3teamFeatureFlags";
import type { ServerConfig } from "@t3tools/contracts";

export const NEXI_WELCOME_SETUP_FLAG = "NEXI_WELCOME_SETUP" satisfies FeatureFlagKey;

/** Whether /welcome should render the Nexi single-page setup instead of WelcomePage. */
export function isNexiWelcomeSetupEnabled(
  config: Pick<ServerConfig, "featureFlags"> | null | undefined,
): boolean {
  return (
    config?.featureFlags?.[NEXI_WELCOME_SETUP_FLAG] ??
    FEATURE_FLAG_DEFINITIONS[NEXI_WELCOME_SETUP_FLAG].defaultEnabled
  );
}
