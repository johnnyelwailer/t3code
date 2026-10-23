/**
 * The digest variant choices as the digest applies them: the stored beta choices while
 * `MYWORK_DIGEST_VARIANTS` is on, the defaults while it is off. Stored choices are kept, so turning
 * the flag back on restores them.
 */
import {
  DEFAULT_T3TEAM_BETA_FLAGS,
  readT3TeamBetaFlags,
  useT3TeamBetaFlags,
  type T3TeamBetaFlags,
} from "~/t3team/t3team-betaFlags";
import { readPrimaryServerConfig } from "~/t3team/t3team-serverState";
import { readServerFeatureFlag, useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

export function digestVariantFlags(stored: T3TeamBetaFlags, enabled: boolean): T3TeamBetaFlags {
  return enabled ? stored : DEFAULT_T3TEAM_BETA_FLAGS;
}

export function useDigestVariantFlags(): T3TeamBetaFlags {
  const { flags } = useT3TeamBetaFlags();
  return digestVariantFlags(flags, useFeatureFlag("MYWORK_DIGEST_VARIANTS"));
}

export function readDigestVariantFlags(): T3TeamBetaFlags {
  return digestVariantFlags(
    readT3TeamBetaFlags(),
    readServerFeatureFlag(readPrimaryServerConfig(), "MYWORK_DIGEST_VARIANTS"),
  );
}
