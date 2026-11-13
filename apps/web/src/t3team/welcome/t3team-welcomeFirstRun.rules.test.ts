// @effect-diagnostics nodeBuiltinImport:off - reads this folder's own sources to enforce the first-run rules
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

/**
 * First-run rules for the welcome page: it opens no picker (file, folder, provider, model) and
 * never changes the user's default provider or model. Provider and model defaults are written
 * through these settings calls, and pickers through these dialog calls; neither belongs here.
 */
const FORBIDDEN = [
  "pickFolder",
  "pickFile",
  "showOpenDialog",
  "textGenerationModelSelection",
  "defaultModelSelection",
  "useUpdatePrimarySettings",
  "useUpdateEnvironmentSettings",
  "ModelPicker",
  "ProviderModelPicker",
];

describe("welcome page first-run rules", () => {
  const dir = __dirname;
  const sources = NodeFS.readdirSync(dir).filter(
    (name) => /\.tsx?$/.test(name) && !name.includes(".test.") && !name.includes(".rules."),
  );

  it("has welcome sources to check", () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  it.each(FORBIDDEN)("never uses %s", (token) => {
    const offenders = sources.filter((name) =>
      NodeFS.readFileSync(NodePath.join(dir, name), "utf8").includes(token),
    );
    expect(offenders).toEqual([]);
  });
});
