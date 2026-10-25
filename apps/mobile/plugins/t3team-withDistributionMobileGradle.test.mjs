import * as NodeModule from "node:module";
import { describe, expect, it } from "vite-plus/test";

const require = NodeModule.createRequire(import.meta.url);
const plugin = require("./t3team-withDistributionMobileGradle.cjs");

describe("the bundle task inputs", () => {
  const options = { distribution: "/d/pack", roots: ["/d/pack/mobile", "/d/pack/native"] };

  it("declare the distribution and every overlay root as inputs of the JS bundle task", () => {
    const snippet = plugin.bundleInputsSnippet(options);
    expect(snippet).toContain("createBundle");
    expect(snippet).toContain(`task.inputs.property('t3codeDistribution', "/d/pack")`);
    expect(snippet).toContain(`project.fileTree(dir: "/d/pack/mobile"`);
    expect(snippet).toContain(`project.fileTree(dir: "/d/pack/native"`);
  });

  it("excludes build outputs: an overlay's native module builds inside the overlay directory", () => {
    // Gradle rejects an input that overlaps another task's output without a dependency.
    expect(plugin.bundleInputsSnippet(options)).toContain("excludes: ['**/build/**'");
  });

  it("is appended to app/build.gradle once", async () => {
    const { withAppBuildGradle } = require("expo/config-plugins");
    expect(typeof withAppBuildGradle).toBe("function");
    // Applying the plugin twice must not duplicate the snippet: the marker guards it.
    const contents = "android {}\n";
    const once = contents + plugin.bundleInputsSnippet(options);
    expect(once.split(plugin.MARKER)).toHaveLength(2);
  });
});
