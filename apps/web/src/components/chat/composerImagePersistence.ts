import type {
  ComposerAttachment,
  PersistedComposerImageAttachment,
} from "../../composerDraftStore";
import { readFileAsDataUrl } from "../../lib/imageCompression";

export async function serializeComposerImages(
  images: ReadonlyArray<ComposerAttachment>,
  persistedAttachments: ReadonlyArray<PersistedComposerImageAttachment>,
): Promise<PersistedComposerImageAttachment[]> {
  const existingPersistedById = new Map(
    persistedAttachments.map((attachment) => [attachment.id, attachment]),
  );
  const stagedAttachmentById = new Map<string, PersistedComposerImageAttachment>();
  await Promise.all(
    images.map(async (image) => {
      try {
        const existingDataUrl = existingPersistedById.get(image.id)?.dataUrl;
        if (existingDataUrl === undefined && image.file === null) {
          // t3team: an attachment re-hydrated without bytes cannot be re-read.
          throw new Error("attachment has no bytes");
        }
        const dataUrl = existingDataUrl ?? (await readFileAsDataUrl(image.file as File));
        stagedAttachmentById.set(image.id, {
          id: image.id,
          name: image.name,
          mimeType: image.mimeType,
          sizeBytes: image.sizeBytes,
          dataUrl,
          // t3team: arbitrary files persist their kind; absent means image on hydration.
          ...(image.type === "file" ? { type: "file" as const } : {}),
          ...(image.source && "kind" in image.source ? { source: image.source } : {}),
        });
      } catch {
        const existingPersisted = existingPersistedById.get(image.id);
        if (existingPersisted) {
          stagedAttachmentById.set(image.id, existingPersisted);
        }
      }
    }),
  );
  return Array.from(stagedAttachmentById.values());
}
