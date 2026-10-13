/**
 * Runtime feature flag: lazy linked-repository reference checkouts — bootstrap writes manifest
 * entries and syncs only the project's main repository eagerly; other linked repos clone/fetch
 * on demand (thread/worktree/PR paths) or one-at-a-time while status is polled.
 *
 * Layering: `NEXI_FF_LAZY_LINKED_REPOSITORY_CHECKOUT` env override > feature_flags DB > code default (on).
 *
 * @module t3team-lazyLinkedRepositoryFlag
 */
import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";

export const LAZY_LINKED_REPOSITORY_CHECKOUT_FLAG_ENV = "NEXI_FF_LAZY_LINKED_REPOSITORY_CHECKOUT";

type ReadEnv = (key: string) => string | undefined;
const processEnv: ReadEnv = (key) => process.env[key];

export function isLazyLinkedRepositoryCheckoutEnabled(readEnv: ReadEnv = processEnv): boolean {
  return readFeatureFlag("LAZY_LINKED_REPOSITORY_CHECKOUT", readEnv);
}
