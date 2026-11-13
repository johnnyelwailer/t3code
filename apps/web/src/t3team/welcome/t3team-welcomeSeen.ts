import { ensureClientSettingsHydrated, persistClientSettingsUpdate } from "~/hooks/useSettings";

import { withWelcomeSeenVersion } from "./t3team-welcomeGating.logic";

/**
 * Records that the current welcome-setup generation is done (finished or skipped) and, if needed,
 * marks onboarding complete. One write, so the two fields cannot race.
 */
export async function completeWelcomeSetup(): Promise<void> {
  await ensureClientSettingsHydrated();
  const onboardingCompletedAt = new Date().toISOString();
  await persistClientSettingsUpdate((current) => {
    const t3team = withWelcomeSeenVersion(current.t3team);
    const completedAt = current.onboardingCompletedAt ?? onboardingCompletedAt;
    if (t3team === current.t3team && completedAt === current.onboardingCompletedAt) {
      return current;
    }
    return { ...current, onboardingCompletedAt: completedAt, t3team };
  });
}
