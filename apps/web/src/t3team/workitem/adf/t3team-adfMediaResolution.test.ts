import { describe, expect, it } from "vite-plus/test";

import { classifyAdfMediaNode } from "./t3team-adfMediaResolution";
import type { AdfNode } from "./t3team-adfRendererTypes";

function media(attrs: Record<string, unknown>): AdfNode {
  return { type: "media", attrs };
}

describe("classifyAdfMediaNode", () => {
  it("classifies a real Jira mp4 attachment as video, by filename alone (no mime type)", () => {
    const node = media({
      id: "att1",
      type: "file",
      alt: "20260511-1240-43.8755420.mp4",
      width: 1870,
      height: 1032,
    });
    expect(classifyAdfMediaNode(node)).toBe("video");
  });

  it("classifies by the __fileMimeType attr real Jira payloads carry", () => {
    const node = media({ id: "att2", __fileMimeType: "video/mp4", __fileName: "clip.mp4" });
    expect(classifyAdfMediaNode(node)).toBe("video");
  });

  it("classifies audio the same way", () => {
    const node = media({ id: "att3", alt: "voicemail.m4a" });
    expect(classifyAdfMediaNode(node)).toBe("audio");
  });

  it("stays a file for an unrecognised extension, even with width/height present", () => {
    // A named-but-unrecognised file must never be silently promoted to "image" just because a
    // size happens to be set — that promotion is reserved for media with NO name at all.
    const node = media({ id: "att4", alt: "clip.unknownext", width: 1280, height: 720 });
    expect(classifyAdfMediaNode(node)).toBe("file");
  });

  it("falls back to width/height-implies-image only when there is no mime type and no filename", () => {
    const pastedScreenshot = media({ id: "att5", width: 1200, height: 800 });
    expect(classifyAdfMediaNode(pastedScreenshot)).toBe("image");

    const noSizeEither = media({ id: "att6" });
    expect(classifyAdfMediaNode(noSizeEither)).toBe("file");
  });

  it("classifies a recognised image extension as image", () => {
    expect(classifyAdfMediaNode(media({ alt: "diagram.png" }))).toBe("image");
  });

  it("classifies a recognised non-media extension as file", () => {
    expect(classifyAdfMediaNode(media({ alt: "report.pdf" }))).toBe("file");
  });
});
