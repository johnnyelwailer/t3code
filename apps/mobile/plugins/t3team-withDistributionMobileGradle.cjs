const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// t3team-distribution-mobile";
const END_MARKER = "// t3team-distribution-mobile end";

/**
 * Makes the selected distribution and its overlay files inputs of the Android JavaScript bundle task
 * (createBundle<Variant>JsAndAssets). Without it the task's inputs are only files under apps/mobile
 * and CLI properties, so an incremental release build after switching T3CODE_DISTRIBUTION, or after
 * editing only overlay files, is UP-TO-DATE: Metro never runs and the previous bundle ships.
 */
function bundleInputsSnippet({ distribution, roots, files = [] }) {
  // A file tree, not the directory itself: an overlay's native module builds under its own
  // `build` directory, and Gradle rejects a task input that overlaps another task's output.
  const trees = roots
    .map(
      (root, index) =>
        `    task.inputs.files(project.fileTree(dir: ${JSON.stringify(root)}, excludes: ['**/build/**', '**/node_modules/**', '**/.gradle/**', '**/.cxx/**'])).withPropertyName('t3codeOverlay${index}')`,
    )
    .join("\n");
  // Single files (a declared package's manifest: its `main` decides which file is the entry).
  const singles = files
    .map(
      (file, index) =>
        `    task.inputs.file(${JSON.stringify(file)}).withPropertyName('t3codeOverlayFile${index}')`,
    )
    .join("\n");
  return [
    "",
    MARKER,
    "tasks.matching { it.name.startsWith('createBundle') && it.name.endsWith('JsAndAssets') }.configureEach { task ->",
    `    task.inputs.property('t3codeDistribution', ${JSON.stringify(distribution)})`,
    trees,
    ...(singles ? [singles] : []),
    "}",
    END_MARKER,
    "",
  ].join("\n");
}

/** The generated block removed (and the build file unchanged when there is none). */
function withoutBlock(contents) {
  const start = contents.indexOf(MARKER);
  if (start === -1) return contents;
  const end = contents.indexOf(END_MARKER, start);
  const stop = end === -1 ? contents.length : end + END_MARKER.length;
  return contents.slice(0, start).replace(/\n+$/, "\n") + contents.slice(stop).replace(/^\n/, "");
}

module.exports = function withDistributionMobileGradle(config, options) {
  return withAppBuildGradle(config, (nextConfig) => {
    // Regenerated on every prebuild: a block left from an earlier distribution would keep Gradle
    // watching the old pack.
    nextConfig.modResults.contents =
      withoutBlock(nextConfig.modResults.contents) + bundleInputsSnippet(options);
    return nextConfig;
  });
};

module.exports.bundleInputsSnippet = bundleInputsSnippet;
module.exports.MARKER = MARKER;
module.exports.END_MARKER = END_MARKER;
module.exports.withoutBlock = withoutBlock;
