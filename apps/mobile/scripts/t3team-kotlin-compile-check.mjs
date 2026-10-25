#!/usr/bin/env node
// ktlint and detekt do not type-check. This compiles the t3team Kotlin sources of the Android
// native modules against minimal Expo, OkHttp and Android stubs so a type error (such as an
// inference cycle) fails in CI instead of in the first release build. It checks our code's types,
// not the real library APIs; the signed APK build remains the final proof.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const here = import.meta.dirname;
const stubs = join(here, "t3team-kotlin-stubs");
const moduleDirectory = resolve(
  here,
  "../modules/t3-terminal/android/src/main/java/expo/modules/t3terminal",
);

function files(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return files(path, extension);
    return path.endsWith(extension) ? [path] : [];
  });
}

const sources = readdirSync(moduleDirectory)
  .filter((name) => name.startsWith("t3team-") && name.endsWith(".kt"))
  .map((name) => join(moduleDirectory, name));
const work = mkdtempSync(join(tmpdir(), "t3team-kotlin-check-"));
const output = join(work, "out");
// The stubs are stored as `*.kt.stub` so ktlint and detekt, which lint every `.kt`, skip them.
const stubDirectory = join(work, "stubs");
mkdirSync(stubDirectory);
const stubSources = files(stubs, ".kt.stub").map((file, index) => {
  const copy = join(stubDirectory, `${index}.kt`);
  copyFileSync(file, copy);
  return copy;
});
try {
  const result = spawnSync(
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
  rmSync(work, { recursive: true, force: true });
}
