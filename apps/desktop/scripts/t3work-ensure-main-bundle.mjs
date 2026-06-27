import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = NodePath.dirname(fileURLToPath(import.meta.url));
const mainBundlePath = NodePath.join(desktopDir, "..", "dist-electron", "main.cjs");
const integrationsAtlassianPath = NodePath.join(
  desktopDir,
  "..",
  "node_modules",
  "@t3tools",
  "integrations-atlassian",
);
const staleExternalRequirePattern = /require\("@t3tools\/integrations-atlassian"\)/;

if (
  NodeFS.existsSync(mainBundlePath) &&
  NodeFS.existsSync(integrationsAtlassianPath) &&
  staleExternalRequirePattern.test(NodeFS.readFileSync(mainBundlePath, "utf8"))
) {
  NodeFS.rmSync(mainBundlePath, { force: true });
}
