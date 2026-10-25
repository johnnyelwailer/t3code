#!/usr/bin/env node
// ktlint and detekt do not type-check. This compiles the t3team Kotlin sources of the Android
// native modules against minimal Expo, OkHttp and Android stubs so a type error (such as an
// inference cycle) fails in CI instead of in the first release build. It checks our code's types,
// not the real library APIs; the signed APK build remains the final proof.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const here = import.meta.dirname;
const stubs = NodePath.join(here, "t3team-kotlin-stubs");
const moduleDirectory = NodePath.resolve(
  here,
  "../modules/t3-terminal/android/src/main/java/expo/modules/t3terminal",
);

function files(directory, extension) {
  return NodeFS.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = NodePath.join(directory, entry.name);
    if (entry.isDirectory()) return files(path, extension);
    return path.endsWith(extension) ? [path] : [];
  });
}

const sources = NodeFS.readdirSync(moduleDirectory)
  .filter((name) => name.startsWith("t3team-") && name.endsWith(".kt"))
  .map((name) => NodePath.join(moduleDirectory, name));
const work = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-kotlin-check-"));
const output = NodePath.join(work, "out");
// The stubs are stored as `*.kt.stub` so ktlint and detekt, which lint every `.kt`, skip them.
const stubDirectory = NodePath.join(work, "stubs");
NodeFS.mkdirSync(stubDirectory);
const stubSources = files(stubs, ".kt.stub").map((file, index) => {
  const copy = NodePath.join(stubDirectory, `${index}.kt`);
  NodeFS.copyFileSync(file, copy);
  return copy;
});
try {
  const result = NodeChildProcess.spawnSync(
    "kotlinc",
    ["-jvm-target", "17", "-Werror", ...sources, ...stubSources, "-d", output],
    { stdio: "inherit" },
  );
  if (result.error) {
    console.error(
      `kotlinc is not available (${result.error.message}); install it with 'brew install kotlin'.`,
    );
    process.exit(2);
  }
  console.log(
    result.status === 0
      ? `Compiled ${sources.length} Kotlin files against the stubs.`
      : "Kotlin compile check failed.",
  );
  process.exit(result.status ?? 1);
} finally {
  NodeFS.rmSync(work, { recursive: true, force: true });
}
