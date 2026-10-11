/**
 * Runtime feature flag: dock a masked secret input and write a repository Actions secret (#671).
 *
 * Layering: `NEXI_FF_REPOSITORY_SECRET_SET` > feature_flags row > code default (off).
 *
 * @module t3team-repositorySecretFlag
 */
import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";

type ReadEnv = (key: string) => string | undefined;
const processEnv: ReadEnv = (key) => process.env[key];

export function isRepositorySecretSetEnabled(readEnv: ReadEnv = processEnv): boolean {
  return readFeatureFlag("REPOSITORY_SECRET_SET", readEnv);
}
