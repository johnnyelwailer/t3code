import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildNativeReviewDiffData } from "../review/nativeReviewDiffAdapter";
import { buildReviewParsedDiff } from "../review/reviewModel";
import {
  pullRequestDiffImageGallery,
  pullRequestDiffImages,
  withPullRequestImageRows,
} from "./pullRequestDiffImages";

const PATCH = [
  "diff --git a/assets/logo.png b/assets/logo.png",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/assets/logo.png",
  "diff --git a/assets/photo.jpg b/assets/photo.jpg",
  "index 1111111..2222222 100644",
  "Binary files a/assets/photo.jpg and b/assets/photo.jpg differ",
  "diff --git a/assets/icon.svg b/assets/icon.svg",
  "--- a/assets/icon.svg",
  "+++ b/assets/icon.svg",
  "@@ -1 +1 @@",
  '-<svg width="1"/>',
  '+<svg width="2"/>',
  "",
].join("\n");

const target = {
  environmentId: EnvironmentId.make("env"),
  input: { projectId: ProjectId.make("p1"), repository: "acme/web", number: 7 },
};

function setup() {
  const parsed = buildReviewParsedDiff(PATCH, "pull-request-images");
  const images = pullRequestDiffImages(parsed);
  const data = withPullRequestImageRows(buildNativeReviewDiffData(parsed), images);
  return { images, data };
}

describe("pullRequestDiffImages", () => {
  it("draws binary images in place of the unsupported-format notice, and leaves text diffs", () => {
    const { images, data } = setup();
    expect(images.map((image) => [image.file.path, image.sides])).toEqual([
      ["assets/logo.png", ["new"]],
      ["assets/photo.jpg", ["old", "new"]],
    ]);
    expect(data.rows.filter((row) => row.kind === "notice")).toEqual([]);
    expect(
      data.rows
        .filter((row) => row.kind === "image" || row.kind === "file")
        .map((row) => [row.kind, row.kind === "image" ? row.imageSides : row.filePath]),
    ).toEqual([
      ["file", "assets/logo.png"],
      ["image", ["new"]],
      ["file", "assets/photo.jpg"],
      ["image", ["old", "new"]],
      ["file", "assets/icon.svg"],
    ]);
    expect(data.rows.some((row) => row.kind === "line" && row.content === '<svg width="2"/>')).toBe(
      true,
    );
  });

  it("opens a gallery of every image side at the one pressed", () => {
    const { images } = setup();
    const photo = images[1]!;
    const source = pullRequestDiffImageGallery({ ...target, commit: "abc1234" }, images, {
      fileId: photo.fileId,
      side: "old",
    });
    expect(source?.name).toBe("Before: assets/photo.jpg");
    expect(source && "resource" in source ? source.resource : null).toEqual({
      _tag: "change-request-file",
      projectId: "p1",
      repository: "acme/web",
      number: 7,
      commit: "abc1234",
      changeType: "change",
      oldPath: "assets/photo.jpg",
      newPath: "assets/photo.jpg",
      side: "old",
    });
    expect(source?.gallery?.map((item) => item.name)).toEqual([
      "assets/logo.png",
      "Before: assets/photo.jpg",
      "After: assets/photo.jpg",
    ]);
    expect(
      pullRequestDiffImageGallery(target, images, { fileId: images[0]!.fileId, side: "old" }),
    ).toBeNull();
  });
});
