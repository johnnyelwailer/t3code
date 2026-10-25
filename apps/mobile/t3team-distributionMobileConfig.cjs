/**
 * What a selected mobile overlay changes about the app's configuration (app.config.ts and
 * fingerprint.config.js call this); an identity for a build without one.
 *
 *   - Expo updates are off: the runtime version is the native fingerprint, overlay JavaScript is not
 *     part of it, and a stock OTA from the fork's EAS project would otherwise replace the overlay's
 *     JavaScript on a distribution binary. The fork's T3CODE_MOBILE_UPDATES_ENABLED does not matter.
 *   - The overlay's files and its entry are part of the runtime version (fingerprint extra source),
 *     so a distribution binary never shares one with a stock binary or another overlay revision.
 *   - A Gradle plugin makes the distribution and the overlay's files inputs of the JavaScript bundle
 *     task: its inputs are otherwise only files under apps/mobile and CLI properties, so after
 *     switching T3CODE_DISTRIBUTION or editing only overlay files an incremental release build would
 *     be UP-TO-DATE and ship the previous (stock) bundle.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  overlayRoots,
  readDistributionMobile,
} = require("./t3team-distributionMobileSelection.cjs");

const GRADLE_PLUGIN = "./plugins/t3team-withDistributionMobileGradle.cjs";

/** @param {string} root @returns {string[]} */
function filesUnder(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", ".generated", "build", ".gradle", ".cxx"].includes(entry.name)) return [];
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

/** A hash of the overlay's files (paths and contents, in a fixed order). */
function overlayContentHash(selection) {
  const hash = crypto.createHash("sha256");
  for (const root of overlayRoots(selection)) {
    for (const file of filesUnder(root).sort()) {
      hash.update(path.relative(selection.packDir, file)).update("\0");
      hash.update(fs.readFileSync(file)).update("\0");
    }
  }
  return hash.digest("hex");
}

/**
 * @template {{ updates?: object, plugins?: unknown[] }} C
 * @param {C} config
 * @param {Record<string, string | undefined>} [env]
 * @returns {C}
 */
function applyDistributionMobile(config, env = process.env) {
  const selection = readDistributionMobile({ env, appRoot: __dirname });
  if (selection === null) return config;
  return {
    ...config,
    updates: { ...config.updates, enabled: false },
    plugins: [
      ...(config.plugins ?? []),
      [GRADLE_PLUGIN, { distribution: selection.packDir, roots: overlayRoots(selection) }],
    ],
  };
}

/** @param {Record<string, string | undefined>} [env] */
function fingerprintSources(env = process.env) {
  const selection = readDistributionMobile({ env, appRoot: __dirname });
  if (selection === null) return [];
  const contents = JSON.stringify({
    entry: path.relative(selection.packDir, selection.entryPath),
    hash: overlayContentHash(selection),
  });
  return [{ type: "contents", id: "distributionMobile", contents }];
}

module.exports = { applyDistributionMobile, fingerprintSources, overlayContentHash };
