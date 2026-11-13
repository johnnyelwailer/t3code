// Build-time reader for a distribution's custom URL scheme(s) that open the app (e.g. nexi).
// app.config.ts calls it; the runtime half (reading the built `extra` config) lives in
// src/lib/t3team-mobileUrlSchemes.ts. The mobile build sets T3CODE_DISTRIBUTION to the pack's dir,
// so this reads the same distribution.json the desktop build reads — one source of truth.
const fs = require("node:fs");
const path = require("node:path");

const URL_SCHEME = /^[a-z][a-z0-9+.-]{0,63}$/u;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function readDistributionUrlSchemes(env = process.env) {
  const dir = env.T3CODE_DISTRIBUTION?.trim();
  if (!dir) return [];
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, "distribution.json"), "utf8"));
  } catch {
    return [];
  }
  const raw =
    typeof manifest === "object" && manifest !== null ? manifest.branding?.urlSchemes : undefined;
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const schemes = [];
  for (const part of raw) {
    const scheme = typeof part === "string" ? part.trim().toLowerCase() : "";
    if (!URL_SCHEME.test(scheme) || seen.has(scheme)) continue;
    seen.add(scheme);
    schemes.push(scheme);
  }
  return schemes;
}

module.exports = { readDistributionUrlSchemes };
