// @effect-diagnostics nodeBuiltinImport:off - builds a synthetic asar on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  bareImportPackages,
  checkPackagedApp,
  findUnresolvableImports,
} from "./t3team-packed-import-check.ts";

const chunk = [
  "#!/usr/bin/env node",
  'import { randomUUID } from "crypto";',
  'import * as NodeV8 from "node:v8";',
  'import WebSocket$1 from "ws";',
  'import { jwtVerify } from "jose/jwt/verify";',
  'import { Effect } from "@scope/pkg/sub";',
  'import "side-effect-only";',
  'import { relative } from "./local.mjs";',
  "",
  "/** first statement */",
  "const embedded = `",
  'import { Type } from "typebox";',
  "`;",
].join("\n");

describe("bareImportPackages", () => {
  it("lists package names from the import header, not builtins, relative paths or embedded source", () => {
    expect(bareImportPackages(chunk)).toEqual(["ws", "jose", "@scope/pkg", "side-effect-only"]);
  });
});

describe("findUnresolvableImports", () => {
  it("reports the packages the app does not contain", () => {
    const found = findUnresolvableImports({
      chunks: [{ file: "a.mjs", source: chunk }],
      hasPackage: (name) => name === "ws" || name === "side-effect-only",
    });
    expect(found).toEqual([
      { file: "a.mjs", packageName: "jose" },
      { file: "a.mjs", packageName: "@scope/pkg" },
    ]);
  });
});

/** asar = pickled JSON header (sizes in the 16-byte prefix) followed by the file bytes. */
const writeAsar = (file: string, entries: Record<string, string>) => {
  const files: Record<string, unknown> = {};
  const bodies: Buffer[] = [];
  let offset = 0;
  const put = (path: string, text: string) => {
    const parts = path.split("/");
    let directory = files;
    for (const part of parts.slice(0, -1)) {
      const next = ((directory[part] as { files?: Record<string, unknown> } | undefined) ??= {
        files: {},
      });
      directory = next.files ??= {};
    }
    const body = Buffer.from(text);
    directory[parts.at(-1)!] = { size: body.length, offset: String(offset) };
    bodies.push(body);
    offset += body.length;
  };
  for (const [path, text] of Object.entries(entries)) put(path, text);
  const json = Buffer.from(JSON.stringify({ files }));
  const padded = Math.ceil(json.length / 4) * 4;
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(padded + 8, 4);
  prefix.writeUInt32LE(padded + 4, 8);
  prefix.writeUInt32LE(json.length, 12);
  NodeFS.writeFileSync(
    file,
    Buffer.concat([prefix, json, Buffer.alloc(padded - json.length), ...bodies]),
  );
};

describe("checkPackagedApp", () => {
  it("finds imports missing from the asar and the app's node_modules directories", () => {
    const resources = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "packed-imports-"));
    try {
      writeAsar(NodePath.join(resources, "app.asar"), {
        "apps/server/dist/server.mjs": chunk,
        "node_modules/ws/package.json": "{}",
      });
      NodeFS.mkdirSync(NodePath.join(resources, "node_modules", "jose"), { recursive: true });
      NodeFS.writeFileSync(NodePath.join(resources, "node_modules", "jose", "package.json"), "{}");
      expect(checkPackagedApp(resources).map((entry) => entry.packageName)).toEqual([
        "@scope/pkg",
        "side-effect-only",
      ]);
    } finally {
      NodeFS.rmSync(resources, { recursive: true, force: true });
    }
  });
});
