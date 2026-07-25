import { describe, expect, it } from "vite-plus/test";

import { collectAdfGalleryImages } from "./t3team-adfImageGallery";
import type { AdfNode, AdfRenderContext } from "./t3team-adfRendererTypes";

const NO_CTX: AdfRenderContext = {};

function media(attrs: Record<string, unknown>): AdfNode {
  return { type: "media", attrs };
}

describe("collectAdfGalleryImages", () => {
  it("collects image media nodes in document order, across nested containers", () => {
    const doc: readonly AdfNode[] = [
      {
        type: "mediaSingle",
        content: [media({ url: "https://example.com/a.png", alt: "first" })],
      },
      {
        type: "mediaGroup",
        content: [
          media({ url: "https://example.com/b.png", alt: "second" }),
          media({ url: "https://example.com/c.png", alt: "third" }),
        ],
      },
    ];

    expect(collectAdfGalleryImages(doc, NO_CTX)).toEqual([
      { src: "https://example.com/a.png", alt: "first" },
      { src: "https://example.com/b.png", alt: "second" },
      { src: "https://example.com/c.png", alt: "third" },
    ]);
  });

  it("skips non-image media (a pdf attachment) and media with no resolvable src", () => {
    const doc: readonly AdfNode[] = [
      { type: "mediaGroup", content: [media({ id: "x", type: "file", alt: "report.pdf" })] },
    ];
    expect(collectAdfGalleryImages(doc, NO_CTX)).toEqual([]);
  });

  it("resolves through the host asset resolver, same as the renderer does", () => {
    const doc: readonly AdfNode[] = [media({ id: "m1", width: 10, height: 10, alt: "chart" })];
    const ctx: AdfRenderContext = { resolveAssetUrl: () => "/local/chart.png" };
    expect(collectAdfGalleryImages(doc, ctx)).toEqual([{ src: "/local/chart.png", alt: "chart" }]);
  });

  it("defaults alt text to 'Image' when the document has none", () => {
    const doc: readonly AdfNode[] = [media({ url: "https://example.com/x.png" })];
    expect(collectAdfGalleryImages(doc, NO_CTX)).toEqual([
      { src: "https://example.com/x.png", alt: "Image" },
    ]);
  });

  it("returns an empty gallery for a document with no images", () => {
    expect(collectAdfGalleryImages([{ type: "paragraph", content: [] }], NO_CTX)).toEqual([]);
  });
});
