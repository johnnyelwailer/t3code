import { describe, expect, it } from "vite-plus/test";

import { isExpirableLogFile } from "./storageCleanup.ts";

describe("diagnostics log retention", () => {
  it.each([
    ["server.log.1", false, true],
    ["server.trace.ndjson.4", false, true],
    ["server.trace.ndjson", false, false],
    ["server.log", false, false],
    ["events.mcp-31a8cb57.log", true, true],
    ["stall-2026-11-06T06-36-59-471Z-25229ms.cpuprofile", true, true],
    ["notes.txt", true, false],
    ["stall.cpuprofile", false, false],
  ] as const)("%s in a subfolder=%s expires=%s", (name, inSubdirectory, expires) => {
    expect(isExpirableLogFile(name, inSubdirectory)).toBe(expires);
  });
});
