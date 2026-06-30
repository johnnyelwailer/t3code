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

function readStorybookPort(args) {
  const portFlagIndex = args.findIndex((arg) => arg === "-p" || arg === "--port");
  if (portFlagIndex === -1) {
    return 6006;
  }

  const rawPort = args[portFlagIndex + 1];
  const parsed = Number.parseInt(String(rawPort), 10);
  return Number.isFinite(parsed) ? parsed : 6006;
}

function isPortPassedInArgs(args) {
  return args.some((arg) => arg === "-p" || arg === "--port");
}

function buildStorybookDevArgs(port) {
  return [
    "x",
    "storybook",
    "dev",
  ...(isPortPassedInArgs(extraArgs) ? [] : ["-p", String(port)]),
    "--host",
    "127.0.0.1",
    "--config-dir",
    configDir,
    "--ci",
    ...extraArgs,
  ];
}

function runStorybook(args) {
  return NodeChildProcess.spawnSync("bun", args, {
    cwd: webRoot,
    env: {
      ...process.env,
      T3WORK_STORYBOOK_SRC_DIR: srcDir,
    },
    stdio: "inherit",
  });
}

try {
  let result;
  if (mode === "build") {
    result = runStorybook(["x", "storybook", "build", "--config-dir", configDir, ...extraArgs]);
  } else if (isPortPassedInArgs(extraArgs)) {
    result = runStorybook(buildStorybookDevArgs(readStorybookPort(extraArgs)));
  } else {
    const preferredPort = Number.parseInt(process.env.T3WORK_STORYBOOK_PORT ?? "6006", 10);
    const fallbackPorts = [preferredPort, 6010, 6011, 6012];
    result = { status: 1 };

    for (const port of fallbackPorts) {
      if (port !== preferredPort) {
        console.warn(`\nPort ${preferredPort} is busy; trying Storybook on http://127.0.0.1:${port}/ …\n`);
      }
      result = runStorybook(buildStorybookDevArgs(port));
      if ((result.status ?? 1) === 0) {
        break;
      }
    }

    if ((result.status ?? 1) !== 0) {
      console.error(
        "\nStorybook failed to start. If an old instance is still running, stop it first:\n" +
          "  lsof -ti :6006 | xargs kill\n" +
          "Then rerun: pnpm storybook\n",
      );
    }
  }

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
} finally {
  NodeFS.rmSync(tempRoot, { recursive: true, force: true });
}
