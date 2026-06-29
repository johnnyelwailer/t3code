/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import * as NodeURL from "node:url";

const scriptDir = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const webRoot = NodePath.resolve(scriptDir, "..");
const mode = process.argv[2] ?? "dev";
const extraArgs = process.argv.slice(3);

const tempRoot = NodeFS.mkdtempSync(NodePath.join(webRoot, ".t3work-storybook-"));
const configDir = tempRoot;
const srcDir = NodePath.join(webRoot, "src");

for (const [sourceName, targetName] of [
  ["t3work-storybook-main.ts", "main.ts"],
  ["t3work-storybook-preview.ts", "preview.ts"],
]) {
  NodeFS.writeFileSync(
    NodePath.join(configDir, targetName),
    NodeFS.readFileSync(NodePath.join(webRoot, "src/t3work/storybook", sourceName), "utf8"),
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
        "127.0.0.1",
        "--config-dir",
        configDir,
        "--ci",
        ...extraArgs,
      ];

try {
  const result = NodeChildProcess.spawnSync("bun", storybookArgs, {
    cwd: webRoot,
    env: {
      ...process.env,
      T3WORK_STORYBOOK_SRC_DIR: srcDir,
    },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
} finally {
  NodeFS.rmSync(tempRoot, { recursive: true, force: true });
}
