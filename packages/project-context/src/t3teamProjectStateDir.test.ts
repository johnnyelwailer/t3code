import { describe, expect, it } from "vite-plus/test";

import * as hook from "./t3teamProjectStateDir.ts";
import * as impl from "./t3team-projectStateDir.ts";

describe("t3teamProjectStateDir hook", () => {
  it("re-exports the fork's project state dir module", () => {
    expect(hook.NEXI_PROJECT_STATE_DIR).toBe(impl.NEXI_PROJECT_STATE_DIR);
    expect(hook.LEGACY_NEXI_PROJECT_STATE_DIR).toBe(impl.LEGACY_NEXI_PROJECT_STATE_DIR);
    expect(hook.T3TEAM_PROJECT_STATE_DIR).toBe(impl.T3TEAM_PROJECT_STATE_DIR);
    expect(hook.PROJECT_STATE_DIR).toBe(impl.PROJECT_STATE_DIR);
    expect(hook.NEXI_STATE_DIR_FLAG_ENV).toBe(impl.NEXI_STATE_DIR_FLAG_ENV);
    expect(hook.PROJECT_MACHINE_FILE_NAME).toBe(impl.PROJECT_MACHINE_FILE_NAME);
    expect(hook.PROJECT_MACHINE_FILE_PATH).toBe(impl.PROJECT_MACHINE_FILE_PATH);
    expect(hook.toPhysicalProjectStatePath).toBe(impl.toPhysicalProjectStatePath);
    expect(hook.projectStateDirLookupOrder).toBe(impl.projectStateDirLookupOrder);
    expect(hook.projectMachineFilePath).toBe(impl.projectMachineFilePath);
    expect(hook.projectMachineFilePathLookupOrder).toBe(impl.projectMachineFilePathLookupOrder);
    expect(hook.projectMachineCheckedLocations).toBe(impl.projectMachineCheckedLocations);
    expect(hook.decideMachineFileMigration).toBe(impl.decideMachineFileMigration);
    expect(hook.isNexiStateDirEnabled).toBe(impl.isNexiStateDirEnabled);
    expect(hook.resolveProjectStateDirName).toBe(impl.resolveProjectStateDirName);
    expect(hook.isNexiStateDirSelectedAtStartup).toBe(impl.isNexiStateDirSelectedAtStartup);
  });
});
