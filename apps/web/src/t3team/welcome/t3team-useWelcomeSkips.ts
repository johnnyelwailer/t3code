import { useState } from "react";

import { persistClientSettingsUpdate, useClientSettings } from "~/hooks/useSettings";

import {
  welcomeSkipFromKeys,
  welcomeSkipKeysWith,
  type WelcomeSkipKey,
} from "./t3team-welcomeSkipped";

/** Skips live in client settings, so quitting mid-setup resumes where the user was. */
export function useWelcomeSkips() {
  const stored = useClientSettings((settings) => settings.t3team.welcomeSkipped);
  // Shown at once; the write follows. It re-reads the newest settings, so a skip made before they
  // loaded cannot overwrite the other fork settings with defaults.
  const [justSkipped, setJustSkipped] = useState<readonly WelcomeSkipKey[]>([]);
  const skip = (key: WelcomeSkipKey) => {
    setJustSkipped((keys) => welcomeSkipKeysWith(keys, key));
    void persistClientSettingsUpdate((current) => {
      const next = welcomeSkipKeysWith(current.t3team.welcomeSkipped, key);
      if (next === current.t3team.welcomeSkipped) return current;
      return { ...current, t3team: { ...current.t3team, welcomeSkipped: next } };
    });
  };
  return { skipped: welcomeSkipFromKeys([...(stored ?? []), ...justSkipped]), skip };
}
