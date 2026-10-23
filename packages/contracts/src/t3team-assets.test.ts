import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { AttachmentCreateUploadUrlInput } from "./assets.ts";
import {
  PROVIDER_SEND_TURN_MAX_FILE_BYTES,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
} from "./chatAttachment.ts";

const isUploadInput = Schema.is(AttachmentCreateUploadUrlInput);

const uploadInput = {
  name: "screenshot.png",
  mimeType: "image/png",
  sizeBytes: 3,
} as const;

describe("AttachmentCreateUploadUrlInput for arbitrary files", () => {
  it("defers image mime validation to the turn attachment schema", () => {
    // The mint schema is shared with arbitrary files, so it accepts any well
    // formed mime. Image mimes providers cannot inline are still rejected
    // when the turn's attachments decode, and the web queue refuses to
    // upload them in the first place.
    expect(isUploadInput({ ...uploadInput, mimeType: "image/svg+xml" })).toBe(true);
  });

  it("caps uploads at the file size, leaving the image cap to the turn schema", () => {
    expect(
      isUploadInput({ ...uploadInput, sizeBytes: PROVIDER_SEND_TURN_MAX_FILE_BYTES + 1 }),
    ).toBe(false);
    expect(
      isUploadInput({ ...uploadInput, sizeBytes: PROVIDER_SEND_TURN_MAX_IMAGE_BYTES + 1 }),
    ).toBe(true);
  });

  it("accepts arbitrary files with a generic mime type", () => {
    expect(isUploadInput({ name: "notes.txt", mimeType: "text/plain", sizeBytes: 3 })).toBe(true);
    expect(isUploadInput({ name: "spec.pdf", mimeType: "application/pdf", sizeBytes: 3 })).toBe(
      true,
    );
    expect(
      isUploadInput({ name: "script.ts", mimeType: "application/octet-stream", sizeBytes: 3 }),
    ).toBe(true);
    expect(isUploadInput({ name: "notes", mimeType: "not a mime", sizeBytes: 3 })).toBe(false);
    expect(isUploadInput({ name: "notes", mimeType: "text/plain/extra", sizeBytes: 3 })).toBe(
      false,
    );
  });
});
