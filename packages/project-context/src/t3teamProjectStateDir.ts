/**
 * Thin re-export of the fork's project state dir module. Callers keep this
 * import path; the `.agents/nexi` default, lookup order, and machine-pointer
 * helpers live in `t3team-projectStateDir.ts`.
 */
export {
  T3TEAM_PROJECT_STATE_DIR,
  LEGACY_NEXI_PROJECT_STATE_DIR,
  NEXI_PROJECT_STATE_DIR,
  NEXI_STATE_DIR_FLAG_ENV,
  isNexiStateDirEnabled,
  resolveProjectStateDirName,
  PROJECT_STATE_DIR,
  isNexiStateDirSelectedAtStartup,
  projectStateDirLookupOrder,
  toPhysicalProjectStatePath,
  PROJECT_MACHINE_FILE_NAME,
  projectMachineFilePath,
  projectMachineFilePathLookupOrder,
  PROJECT_MACHINE_FILE_PATH,
  projectMachineCheckedLocations,
  decideMachineFileMigration,
} from "./t3team-projectStateDir.ts";
