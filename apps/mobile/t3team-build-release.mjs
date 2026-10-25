/* oxlint-disable t3code/no-global-process-runtime -- Build bootstrap runs before any host runtime. */
// Local standalone release APK. Distribution releases use the signed root packager instead.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const mobile = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
if (NodeFS.existsSync(NodePath.resolve(mobile, "android"))) {
  throw new Error(
    "Use a disposable checkout without apps/mobile/android; preserve existing native work first.",
  );
}
const env = { ...process.env, APP_VARIANT: "production", NODE_ENV: "production" };
function run(command, args, cwd) {
  const result = NodeChildProcess.spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(command),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
run(pnpm, ["exec", "expo", "prebuild", "--platform", "android", "--no-install"], mobile);
run(
  process.platform === "win32" ? "gradlew.bat" : "./gradlew",
  ["--no-daemon", ":app:assembleRelease"],
  NodePath.resolve(mobile, "android"),
);
console.log("Standalone APK: apps/mobile/android/app/build/outputs/apk/release/app-release.apk");
