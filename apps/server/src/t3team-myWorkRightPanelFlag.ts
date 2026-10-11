/**
 * Runtime feature flag: My Work aside uses `RightPanelTabs` on `MY_WORK_PANEL_REF` (PR / thread /
 * browser tabs) with Agent kickoff when no surfaces are open. Off falls back to the legacy
 * DigestPrAside swap.
 *
 * Layering: `NEXI_FF_MYWORK_RIGHT_PANEL` env override > feature_flags DB value > code default (on).
 * Explicit `0`/`false`/`off` disables; `1`/`true`/`on` enables. Unset and blank are not an
 * override. Read live on every call.
 */

import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";

type ReadEnv = (key: string) => string | undefined;
const processEnv: ReadEnv = (key) => process.env[key];

export function isMyWorkRightPanelEnabled(readEnv: ReadEnv = processEnv): boolean {
  return readFeatureFlag("MYWORK_RIGHT_PANEL", readEnv);
}
