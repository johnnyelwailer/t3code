// @effect-diagnostics nodeBuiltinImport:off - read by vite.config.ts and tests at load time.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const here = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));

const readList = (name: string): ReadonlyArray<string> =>
  NodeFS.readFileSync(
    NodePath.join(here, "..", "src", `t3team-reactCompilerPending.${name}.txt`),
    "utf8",
  )
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

// Fork-only web files on the React Compiler ratchet (see ../src/t3team-reactCompilerPending.test.ts).
export const t3teamReactCompilerPending = {
  bailouts: readList("bailouts"),
  lintOnly: readList("lintOnly"),
};
