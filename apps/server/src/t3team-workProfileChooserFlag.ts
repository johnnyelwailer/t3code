/**
 * Runtime feature flag: work profile chooser — the "who are you, and how do you want to work?"
 * profile picker on the first-run setup surface, the add-project wizard's `profile` step, and
 * the Settings "Default project setup" picker.
 *
 * Temporarily OFF by default (2026-10-07): the shipped profiles are too dev-focused — only the
 * developer profile is genuinely tailored — so the chooser costs a setup step without changing
 * the experience. While it is off, everyone gets the developer profile (see
 * `t3team-pack-setupProfileDefault.ts`). Relanding is tracked in
 * https://nexplore.ghe.com/hive/nx-nexi/issues/60.
 *
 * The server advertises the flag to clients through `ServerConfig.workProfileChooser`; a server
 * that predates the field is treated as "off" by clients.
 *
 * Layering: `NEXI_FF_WORK_PROFILE_CHOOSER` env override > feature_flags DB value > code default
 * (off). Explicit `0`/`false`/`off` disables; `1`/`true`/`on` enables. Unset and blank are not an
 * override. Read live on every call, so the flag is toggleable per process without a restart.
 */

import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";

type ReadEnv = (key: string) => string | undefined;
const processEnv: ReadEnv = (key) => process.env[key];

export function isWorkProfileChooserEnabled(readEnv: ReadEnv = processEnv): boolean {
  return readFeatureFlag("WORK_PROFILE_CHOOSER", readEnv);
}
