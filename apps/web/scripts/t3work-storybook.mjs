/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import * as NodeURL from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, "..");
const mode = process.argv[2] ?? "dev";
const extraArgs = process.argv.slice(3);

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "t3work-storybook-"));
const configDir = path.join(tempRoot, ".storybook");

mkdirSync(configDir, { recursive: true });
symlinkSync(path.join(webRoot, "src"), path.join(tempRoot, "src"), "dir");
symlinkSync(path.join(webRoot, "node_modules"), path.join(tempRoot, "node_modules"), "dir");

for (const [sourceName, targetName] of [
  ["t3work-storybook-main.ts", "main.ts"],
  ["t3work-storybook-preview.ts", "preview.ts"],
]) {
  writeFileSync(
    path.join(configDir, targetName),
    readFileSync(path.join(webRoot, "src/t3work/storybook", sourceName), "utf8"),
  );
}

const storybookArgs =
  mode === "build"
    ? ["x", "storybook", "build", "--config-dir", configDir, ...extraArgs]
    : [
        "x",
        "storybook",
        "dev",
        "-p",
        "6006",
        "--host",
        "localhost",
        "--config-dir",
        configDir,
        ...extraArgs,
      ];

try {
  const result = spawnSync("bun", storybookArgs, {
    cwd: webRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
