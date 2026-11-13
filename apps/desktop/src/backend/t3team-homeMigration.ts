// @effect-diagnostics nodeBuiltinImport:off - home and profile migration is a synchronous startup step on disk.

import { type JoinPath } from "./t3team-homeMigrationTypes.ts";
import { isRealStateDb, writeNexiIdentityMarker } from "./t3team-homeMigrationOwnership.ts";
import { type HomeMigrationResult, migrateNexiHome } from "./t3team-homeMigrationHome.ts";
import { type ProfileMigrationResult, migrateNexiProfile } from "./t3team-homeMigrationProfile.ts";

export type {
  JoinPath,
  HomeOwnership,
  NexiIdentityMarker,
  MigrationStamp,
  MigrationStatus,
} from "./t3team-homeMigrationTypes.ts";
export {
  readNexiIdentityMarker,
  writeNexiIdentityMarker,
  detectHomeOwnership,
  detectProfileOwnership,
} from "./t3team-homeMigrationOwnership.ts";
export { readMigrationStatus, migrationWarningForUser } from "./t3team-homeMigrationCopy.ts";
export type { HomeMigrationResult } from "./t3team-homeMigrationHome.ts";
export { migrateNexiHome } from "./t3team-homeMigrationHome.ts";
export type { ProfileMigrationResult } from "./t3team-homeMigrationProfile.ts";
export { migrateNexiProfile } from "./t3team-homeMigrationProfile.ts";

/**
 * Upgrade path used at startup: consider `~/.t3` as a source and the branded
 * or isolated home as the destination, then consider the shared `t3code-v2`
 * profile as a source for the isolated Electron profile.
 */
export function migrateExistingNexiUser(input: {
  readonly defaultLegacyHome: string;
  readonly brandedHome: string;
  readonly sharedProfileDir: string | undefined;
  readonly isolatedProfileDir: string | undefined;
  readonly join: JoinPath;
  readonly stamp: string;
  readonly platform: NodeJS.Platform;
  readonly appId?: string;
  readonly productName?: string;
}): {
  readonly home: string;
  readonly homeResult: HomeMigrationResult;
  readonly profileResult?: ProfileMigrationResult | undefined;
} {
  const homeResult = migrateNexiHome({
    legacyDir: input.defaultLegacyHome,
    brandedDir: input.brandedHome,
    join: input.join,
    stamp: input.stamp,
  });
  let profileResult: ProfileMigrationResult | undefined;
  if (input.isolatedProfileDir !== undefined && input.sharedProfileDir !== undefined) {
    profileResult = migrateNexiProfile({
      sourceProfileDir: input.sharedProfileDir,
      destinationProfileDir: input.isolatedProfileDir,
      join: input.join,
      stamp: input.stamp,
      adjacentNexiHome: input.brandedHome,
      platform: input.platform,
    });
  }
  const markedHome =
    homeResult.home === input.brandedHome &&
    isRealStateDb(input.join(input.brandedHome, "userdata"), input.join)
      ? input.brandedHome
      : homeResult.home;
  writeNexiIdentityMarker(
    markedHome,
    {
      product: "nexi-work",
      appId: input.appId,
      productName: input.productName,
    },
    input.join,
  );
  return { home: homeResult.home, homeResult, profileResult };
}
