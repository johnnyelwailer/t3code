import { describe, expect, it } from "vite-plus/test";

import {
  diffImageMimeType,
  diffImageSides,
  type DiffFileChangeType,
  type DiffImageSide,
} from "./diffImage.ts";

const cases: ReadonlyArray<
  readonly [string, DiffFileChangeType, number, ReadonlyArray<DiffImageSide>]
> = [
  ["assets/logo.png", "new", 0, ["new"]],
  ["assets/logo.PNG", "change", 0, ["old", "new"]],
  ["assets/photo.jpg", "deleted", 0, ["old"]],
  ["assets/moved.gif", "rename-pure", 0, ["new"]],
  ["assets/moved.webp", "rename-changed", 0, ["old", "new"]],
  ["assets/icon.svg", "change", 3, []],
  ["assets/icon.svg", "new", 0, ["new"]],
  ["src/app.ts", "change", 0, []],
  ["fonts/inter.woff2", "new", 0, []],
];

describe("diffImageSides", () => {
  it.each(cases)("%s (%s, %i lines) shows %j", (path, changeType, lineCount, sides) => {
    expect(diffImageSides({ path, changeType, lineCount })).toEqual(sides);
  });
});

describe("diffImageMimeType", () => {
  it("names the image type, and nothing for non-images", () => {
    expect(diffImageMimeType("a/b.jpeg")).toBe("image/jpeg");
    expect(diffImageMimeType("a/b.svg")).toBe("image/svg+xml");
    expect(diffImageMimeType("a/b.mp4")).toBeNull();
  });
});
