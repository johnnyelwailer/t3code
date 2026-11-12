import { getClientSettings, updateClientSettings, useClientSettings } from "~/hooks/useSettings";

import {
  welcomeSkipFromKeys,
  welcomeSkipKeysWith,
  type WelcomeSkipKey,
} from "./t3team-welcomeSkipped";

/** Skips live in client settings, so quitting mid-setup resumes where the user was. */
export function useWelcomeSkips() {
  const stored = useClientSettings((settings) => settings.t3team.welcomeSkipped);
  const skip = (key: WelcomeSkipKey) => {
    const t3team = getClientSettings().t3team;
    const next = welcomeSkipKeysWith(t3team.welcomeSkipped, key);
    if (next === t3team.welcomeSkipped) return;
    void updateClientSettings({ t3team: { ...t3team, welcomeSkipped: next } });
  };
  return { skipped: welcomeSkipFromKeys(stored), skip };
}
