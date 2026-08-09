import { describe, expect, it } from "vite-plus/test";

import { classifyMediaKind } from "./t3team-mediaKind";

describe("classifyMediaKind", () => {
  it("classifies by mime type first", () => {
    expect(classifyMediaKind({ mimeType: "image/png" })).toBe("image");
    expect(classifyMediaKind({ mimeType: "video/mp4" })).toBe("video");
    expect(classifyMediaKind({ mimeType: "audio/mpeg" })).toBe("audio");
    expect(classifyMediaKind({ mimeType: "application/pdf" })).toBe("file");
  });

  it("is case-insensitive and tolerant of surrounding whitespace on the mime type", () => {
    expect(classifyMediaKind({ mimeType: " VIDEO/MP4 " })).toBe("video");
  });

  it("falls back to the filename extension when there is no mime type", () => {
    expect(classifyMediaKind({ filename: "diagram.png" })).toBe("image");
    expect(classifyMediaKind({ filename: "20260511-1240-43.8755420.mp4" })).toBe("video");
    expect(classifyMediaKind({ filename: "voicemail.m4a" })).toBe("audio");
    expect(classifyMediaKind({ filename: "report.pdf" })).toBe("file");
  });

  it("prefers the mime type over a conflicting extension", () => {
    expect(classifyMediaKind({ mimeType: "video/mp4", filename: "clip.unknown" })).toBe("video");
  });

  it("returns 'file' for an unrecognised extension and no mime type", () => {
    expect(classifyMediaKind({ filename: "archive.7z" })).toBe("file");
    expect(classifyMediaKind({ filename: "notes.xyz123" })).toBe("file");
  });

  it("returns 'file' when neither mime type nor filename is present", () => {
    expect(classifyMediaKind({})).toBe("file");
  });
});
