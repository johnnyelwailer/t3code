import { describe, expect, it } from "vitest";

import {
  DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID,
  renderT3WorkProjectSetupFiles,
  resolveT3WorkProjectSetupProfileId,
  T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
  T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
} from "./t3work-projectSetup.js";

describe("resolveT3WorkProjectSetupProfileId", () => {
  it("falls back to the default profile for unknown ids", () => {
    expect(resolveT3WorkProjectSetupProfileId("unknown-profile")).toBe(
      DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID,
    );
  });
});

describe("renderT3WorkProjectSetupFiles", () => {
  it("renders the default setup scaffold", () => {
    const files = renderT3WorkProjectSetupFiles();
    const agents = files.find((file) => file.relativePath === "AGENTS.md");
    const manifest = files.find(
      (file) => file.relativePath === T3WORK_PROJECT_PROFILE_MANIFEST_PATH,
    );
    const entrypoint = files.find(
      (file) => file.relativePath === T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
    );

    expect(agents?.contents).toContain("Use plain, non-technical language");
    expect(agents?.contents).toContain(T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH);
    expect(manifest?.writeMode).toBe("overwrite");
    expect(manifest?.contents).toContain(DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID);
    expect(entrypoint?.contents).toContain("pending-sync");
  });
});
