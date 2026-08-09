import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  shouldShowAttachmentThumbnail,
  WorkItemAttachmentTile,
  workItemAttachmentGlyph,
} from "./t3team-WorkItemAttachmentTile";

describe("workItemAttachmentGlyph", () => {
  it("picks a glyph from the mime type", () => {
    expect(workItemAttachmentGlyph({ mimeType: "application/pdf" })).toBe(
      workItemAttachmentGlyph({ filename: "spec.pdf" }),
    );
    expect(workItemAttachmentGlyph({ mimeType: "video/mp4" })).not.toBe(
      workItemAttachmentGlyph({ mimeType: "audio/mpeg" }),
    );
    expect(workItemAttachmentGlyph({ mimeType: "application/zip" })).not.toBe(
      workItemAttachmentGlyph({ mimeType: "text/plain" }),
    );
  });

  it("falls back to the file extension when there is no mime type", () => {
    expect(workItemAttachmentGlyph({ filename: "notes.md" })).toBe(
      workItemAttachmentGlyph({ mimeType: "text/markdown" }),
    );
    expect(workItemAttachmentGlyph({ filename: "archive.tar.gz" })).toBe(
      workItemAttachmentGlyph({ mimeType: "application/zip" }),
    );
  });

  it("still recognises video/audio extensions after the shared classifyMediaKind refactor", () => {
    expect(workItemAttachmentGlyph({ filename: "clip.avi" })).toBe(
      workItemAttachmentGlyph({ mimeType: "video/mp4" }),
    );
    expect(workItemAttachmentGlyph({ filename: "clip.mkv" })).toBe(
      workItemAttachmentGlyph({ mimeType: "video/mp4" }),
    );
    expect(workItemAttachmentGlyph({ filename: "voicemail.m4a" })).toBe(
      workItemAttachmentGlyph({ mimeType: "audio/mpeg" }),
    );
  });

  it("defaults to a generic glyph for unknown types", () => {
    const generic = workItemAttachmentGlyph({});
    expect(generic).toBe(workItemAttachmentGlyph({ mimeType: "application/octet-stream" }));
  });
});

describe("shouldShowAttachmentThumbnail", () => {
  it("shows the thumbnail only for an image with a resolved src that has not failed to load", () => {
    expect(
      shouldShowAttachmentThumbnail({ isImageMime: true, hasImageSrc: true, imageFailed: false }),
    ).toBe(true);
  });

  it("falls back to the glyph once the image reports a load failure via onError", () => {
    expect(
      shouldShowAttachmentThumbnail({ isImageMime: true, hasImageSrc: true, imageFailed: true }),
    ).toBe(false);
  });

  it("never attempts a thumbnail for a non-image mime type", () => {
    expect(
      shouldShowAttachmentThumbnail({ isImageMime: false, hasImageSrc: true, imageFailed: false }),
    ).toBe(false);
  });

  it("never attempts a thumbnail without a resolved image src", () => {
    expect(
      shouldShowAttachmentThumbnail({ isImageMime: true, hasImageSrc: false, imageFailed: false }),
    ).toBe(false);
  });
});

function render(props: Parameters<typeof WorkItemAttachmentTile>[0]): string {
  return renderToStaticMarkup(<WorkItemAttachmentTile {...props} />);
}

describe("WorkItemAttachmentTile", () => {
  it("renders a real thumbnail for an image attachment", () => {
    const markup = render({
      attachment: { filename: "diagram.png", mimeType: "image/png", size: 2048 },
      href: "/assets/diagram.png",
      imageSrc: "/assets/diagram.png",
      nowMs: Date.now(),
    });

    expect(markup).toContain("<img");
    expect(markup).toContain("diagram.png");
    expect(markup).toContain("2.0 KB");
  });

  it("renders a mime-derived glyph for a non-image attachment", () => {
    const markup = render({
      attachment: { filename: "report.pdf", mimeType: "application/pdf", size: 1024 },
      href: "/assets/report.pdf",
      imageSrc: undefined,
      nowMs: Date.now(),
    });

    expect(markup).not.toContain("<img");
    expect(markup).toContain("report.pdf");
  });

  it("shows author and date only from @lg/workitem up", () => {
    const nowMs = Date.UTC(2026, 6, 25);
    const markup = render({
      attachment: {
        filename: "log.txt",
        mimeType: "text/plain",
        author: "Ada Lovelace",
        created: new Date(nowMs - 60_000).toISOString(),
      },
      href: "/assets/log.txt",
      imageSrc: undefined,
      nowMs,
    });

    expect(markup).toContain("Ada Lovelace");
    expect(markup).toContain("@lg/workitem:inline");
  });
});
