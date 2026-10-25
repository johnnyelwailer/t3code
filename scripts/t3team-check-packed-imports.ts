#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - CLI entry point.
// @effect-diagnostics globalConsole:off - operator-facing CLI output.
/**
 * Fails when the packaged server bundle imports a package the packaged app does not contain.
 *
 * Usage: `node scripts/t3team-check-packed-imports.ts "<App>.app/Contents/Resources"`
 */
import { checkPackagedApp } from "./lib/t3team-packed-import-check.ts";

const resourcesDir = process.argv[2];
if (!resourcesDir) {
  console.error("usage: t3team-check-packed-imports.ts <app Resources directory>");
  process.exit(2);
}

const missing = checkPackagedApp(resourcesDir);
if (missing.length === 0) {
  console.log(
    "packed imports ok: every bare import in apps/server/dist resolves from the packaged app",
  );
} else {
  for (const { file, packageName } of missing) {
    console.error(`unresolvable bare import ${JSON.stringify(packageName)} in ${file}`);
  }
  console.error(
    "The packaged server ships no workspace node_modules; this import would crash the backend on boot. " +
      "Declare the package in apps/server/package.json so the bundler inlines it.",
  );
  process.exit(1);
}
