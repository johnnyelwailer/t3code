// @effect-diagnostics nodeBuiltinImport:off - build-time filesystem reader outside Effect runtime.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { decodeWorkspacePackManifest } from "@t3team/packs";
import { resolvePackAssetPath } from "../../../packages/t3team-packs/src/t3team-packs.assetPath.ts";

/** Statically import collection modules so the executable needs no pack files at runtime. */
export function distributionPersistenceModule(
  directory: string,
  packs?: readonly string[],
): string {
  // Pack roots are explicit trusted build inputs; each module stays inside its own root.
  const roots = packs?.map((path) => NodePath.resolve(directory, path)) ?? [directory];
  const imports: string[] = [];
  const entries: string[] = [];
  const ids = new Set<string>();
  for (const root of roots) {
    const manifestPath = NodePath.join(root, "pack.json");
    if (!NodeFS.existsSync(manifestPath) && packs === undefined) continue;
    const manifest = decodeWorkspacePackManifest(
      JSON.parse(NodeFS.readFileSync(manifestPath, "utf8")),
    );
    const refs = manifest.contents.persistence ?? [];
    if (refs.length === 0) continue;
    if (!manifest.capabilities.includes("store:v1"))
      throw new Error(`Pack ${manifest.id} persistence requires store:v1`);
    if (ids.has(manifest.id)) throw new Error(`Duplicate persistence pack ${manifest.id}`);
    ids.add(manifest.id);
    const modules = refs.map((reference) => {
      const name = `__persistence${imports.length}`;
      const path = resolvePackAssetPath(root, reference.path).split(NodePath.sep).join("/");
      imports.push(`import ${name} from ${JSON.stringify(path)};`);
      return name;
    });
    entries.push(`{ packId: ${JSON.stringify(manifest.id)}, modules: [${modules.join(", ")}] }`);
  }
  return `${imports.join("\n")}\nexport const distributionPersistence = [${entries.join(", ")}];\n`;
}
