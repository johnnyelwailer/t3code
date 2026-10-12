import { describe, expect, it } from "vite-plus/test";

import { detectComposerTrigger, serializeComposerFileLink } from "./composerTrigger.ts";

describe("detectComposerTrigger", () => {
  it.each(["$", "€", "£", "¥", "₹", "₩", "₿", "𑿝"])(
    "detects %s skill prefixes and their source range",
    (prefix) => {
      const text = `Use ${prefix}review`;
      expect(detectComposerTrigger(text, text.length)).toEqual({
        kind: "skill",
        query: "review",
        rangeStart: 4,
        rangeEnd: text.length,
      });
    },
  );

  it.each(["NX-", "NX-12", "ABC123-", "PROJ-9"])(
    "detects %s as the work-item trigger with its source range",
    (key) => {
      const text = `Ref ${key}`;
      expect(detectComposerTrigger(text, text.length)).toEqual({
        kind: "work-item",
        query: key,
        rangeStart: 4,
        rangeEnd: text.length,
      });
    },
  );

  it("leaves lowercase tokens and dash-less prefixes without a work-item trigger", () => {
    for (const text of ["self-hosted", "Fix NX", "nx-12"]) {
      expect(detectComposerTrigger(text, text.length)).not.toEqual({ kind: "work-item" });
    }
  });
});

describe("serializeComposerFileLink", () => {
  it("uses the basename as the markdown label", () => {
    expect(serializeComposerFileLink("path/to/package.json")).toBe(
      "[package.json](path/to/package.json)",
    );
  });

  it("encodes markdown-sensitive destination characters", () => {
    expect(serializeComposerFileLink("docs/My File (draft).md")).toBe(
      "[My File (draft).md](docs/My%20File%20%28draft%29.md)",
    );
  });

  it("supports windows paths", () => {
    expect(serializeComposerFileLink("C:\\repo\\src\\index.ts")).toBe(
      "[index.ts](C:%5Crepo%5Csrc%5Cindex.ts)",
    );
  });

  it("preserves paths that legitimately start with an at sign", () => {
    expect(serializeComposerFileLink("@scope/package.json")).toBe(
      "[package.json](@scope/package.json)",
    );
  });
});
