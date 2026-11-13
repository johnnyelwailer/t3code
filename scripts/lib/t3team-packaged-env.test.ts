import { describe, expect, it } from "vite-plus/test";

import { t3teamFillPackagedAtlassianEnv } from "./t3team-packaged-env.ts";

describe("t3teamFillPackagedAtlassianEnv", () => {
  it("fills a missing client secret from the build environment", () => {
    const result = t3teamFillPackagedAtlassianEnv("T3WORK_ATLASSIAN_CLIENT_ID=id\n", {
      T3WORK_ATLASSIAN_CLIENT_SECRET: "s3cret",
    });
    expect(result.filledKeys).toEqual(["T3TEAM_ATLASSIAN_CLIENT_SECRET"]);
    expect(result.text).toBe(
      "T3WORK_ATLASSIAN_CLIENT_ID=id\nT3TEAM_ATLASSIAN_CLIENT_SECRET=s3cret\n",
    );
  });

  it("keeps values the file already defines", () => {
    const text = "T3TEAM_ATLASSIAN_CLIENT_ID=file-id\nT3TEAM_ATLASSIAN_CLIENT_SECRET=file-secret\n";
    const result = t3teamFillPackagedAtlassianEnv(text, {
      T3TEAM_ATLASSIAN_CLIENT_ID: "env-id",
      T3TEAM_ATLASSIAN_CLIENT_SECRET: "env-secret",
    });
    expect(result.filledKeys).toEqual([]);
    expect(result.text).toBe(text);
  });

  it("creates both keys for an empty file", () => {
    const result = t3teamFillPackagedAtlassianEnv("", {
      VITE_ATLASSIAN_CLIENT_ID: "id",
      ATLASSIAN_CLIENT_SECRET: "s",
    });
    expect(result.text).toBe("T3TEAM_ATLASSIAN_CLIENT_ID=id\nT3TEAM_ATLASSIAN_CLIENT_SECRET=s\n");
  });

  it("allows a client id without a secret (hive #1055 ships ids only)", () => {
    const result = t3teamFillPackagedAtlassianEnv("T3TEAM_ATLASSIAN_CLIENT_ID=visible-id", {});
    expect(result.text).toBe("T3TEAM_ATLASSIAN_CLIENT_ID=visible-id");
    expect(result.filledKeys).toEqual([]);
  });

  it("leaves a build without Atlassian config alone", () => {
    expect(t3teamFillPackagedAtlassianEnv("FOO=1\n", {})).toEqual({
      text: "FOO=1\n",
      filledKeys: [],
    });
  });
});
