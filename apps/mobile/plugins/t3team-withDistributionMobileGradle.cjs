const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// t3team-distribution-mobile";

/**
 * Makes the selected distribution and its overlay files inputs of the Android JavaScript bundle task
 * (createBundle<Variant>JsAndAssets). Without it the task's inputs are only files under apps/mobile
 * and CLI properties, so an incremental release build after switching T3CODE_DISTRIBUTION, or after
 * editing only overlay files, is UP-TO-DATE: Metro never runs and the previous bundle ships.
 */
function bundleInputsSnippet({ distribution, roots }) {
  // A file tree, not the directory itself: an overlay's native module builds under its own
  // `build` directory, and Gradle rejects a task input that overlaps another task's output.
  const trees = roots
    .map(
      (root, index) =>
        `    task.inputs.files(fileTree(dir: ${JSON.stringify(root)}) { exclude '**/build/**', '**/node_modules/**', '**/.gradle/**', '**/.cxx/**' }).withPropertyName('t3codeOverlay${index}')`,
    )
    .join("\n");
  return [
    "",
    MARKER,
    "tasks.matching { it.name.startsWith('createBundle') && it.name.endsWith('JsAndAssets') }.configureEach { task ->",
    `    task.inputs.property('t3codeDistribution', ${JSON.stringify(distribution)})`,
    trees,
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
