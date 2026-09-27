import { describe, expect, it } from "vite-plus/test";

import { videoMimeType } from "./video.ts";

describe("videoMimeType", () => {
  it("recognizes a saved video with a generic picker MIME type", () => {
    expect(videoMimeType({ name: "Recording.MOV", mimeType: "application/octet-stream" })).toBe(
      "video/quicktime",
    );
  });

  it("keeps an explicit video MIME type authoritative and removes parameters", () => {
    expect(videoMimeType({ name: "recording.mp4", mimeType: " VIDEO/WebM; codecs=vp9 " })).toBe(
      "video/webm",
    );
  });

  it("never treats an audio file with a video container extension as a video", () => {
    // Voice notes record as audio/webm; the .webm extension must not re-route
    // them through the video pipeline (that used to render two players).
    expect(videoMimeType({ name: "voice-note.webm", mimeType: "audio/webm" })).toBeNull();
    expect(videoMimeType({ name: "voice-note.mp4", mimeType: "audio/mp4" })).toBeNull();
  });

  it.each(["README", "report.pdf", "file.constructor", "file.__proto__"])(
    "does not mistake %s for a video",
    (name) => {
      expect(videoMimeType({ name, mimeType: "application/octet-stream" })).toBeNull();
    },
  );

  it("keeps a declared non-video MIME type instead of inferring from the extension", () => {
    expect(videoMimeType({ name: "recording.mp4", mimeType: "application/pdf" })).toBeNull();
    expect(videoMimeType({ name: "recording.mp4", mimeType: "image/png" })).toBeNull();
  });
});
