import { describe, expect, it } from "vite-plus/test";

import { repositoryFileBytes, repositoryFileOutputBudget } from "./gitLabRepositoryFileJson.ts";

describe("repositoryFileBytes", () => {
  it("decodes base64 content into the file's bytes, NUL included", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    const raw = JSON.stringify({
      file_name: "logo.png",
      encoding: "base64",
      content: Buffer.from(png).toString("base64"),
    });
    expect(repositoryFileBytes(raw)).toEqual(png);
  });

  it.each([
    ["text encoding", JSON.stringify({ encoding: "text", content: "x" })],
    ["no content", JSON.stringify({ encoding: "base64" })],
    ["not JSON", "<html>"],
  ])("refuses an answer with %s", (_name, raw) => {
    expect(repositoryFileBytes(raw)).toBeNull();
  });

  it("budgets for base64 growth", () => {
    expect(repositoryFileOutputBudget(3 * 1024)).toBe(4 * 1024 + 64 * 1024);
  });
});
