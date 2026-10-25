const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// t3team-distribution-mobile";

/**
 * Makes the selected distribution and its overlay files inputs of the Android JavaScript bundle task
 * (createBundle<Variant>JsAndAssets). Without it the task's inputs are only files under apps/mobile
 * and CLI properties, so an incremental release build after switching T3CODE_DISTRIBUTION, or after
 * editing only overlay files, is UP-TO-DATE: Metro never runs and the previous bundle ships.
 */
function bundleInputsSnippet({ distribution, roots }) {
  const directories = roots
    .map((root) => `    task.inputs.dir(${JSON.stringify(root)})`)
    .join("\n");
  return [
    "",
    MARKER,
    "tasks.matching { it.name.startsWith('createBundle') && it.name.endsWith('JsAndAssets') }.configureEach { task ->",
    `    task.inputs.property('t3codeDistribution', ${JSON.stringify(distribution)})`,
    directories,
    "}",
    "",
  ].join("\n");
}

module.exports = function withDistributionMobileGradle(config, options) {
  return withAppBuildGradle(config, (nextConfig) => {
    if (!nextConfig.modResults.contents.includes(MARKER)) {
      nextConfig.modResults.contents += bundleInputsSnippet(options);
    }
    return nextConfig;
  });
};

module.exports.bundleInputsSnippet = bundleInputsSnippet;
module.exports.MARKER = MARKER;
