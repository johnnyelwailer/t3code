import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

import { NEXI_WELCOME_SETUP_FLAG } from "./t3team-welcomeGating.logic";

export function useNexiWelcomeEnabled(): boolean {
  return useFeatureFlag(NEXI_WELCOME_SETUP_FLAG);
}
