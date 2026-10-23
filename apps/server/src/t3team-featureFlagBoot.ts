/** Side-effect module: installs the release preset when evaluated. Entry points import it before
 * the CLI module graph, because `PROJECT_STATE_DIR` and other startup-only flags freeze when their
 * modules evaluate. A malformed preset is reported and ignored, so a bad build still starts on
 * code defaults instead of not at all. */
import { installFeatureFlagPresetFromEnv } from "@t3tools/project-context/t3team-featureFlagPreset";

try {
  installFeatureFlagPresetFromEnv();
} catch (error) {
  process.stderr.write(`Ignoring malformed T3TEAM_FLAG_PRESET: ${String(error)}
`);
}
