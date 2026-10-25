import { isTunnelUrl } from "./t3team-nexiNativeFetchAuth";

/**
 * "Open in another app" for an asset URL. A broker tunnel URL only works inside this app, so the
 * file is downloaded (an authorized download) and the native viewer opens the local copy; any other
 * URL is handed to `open` as before. `report` gets a failure message for the user.
 */
export async function openAssetUrl(input: {
  readonly url: string;
  readonly attachment: { readonly name: string; readonly mimeType: string };
  readonly open: (url: string) => unknown;
  readonly report: (message: string) => void;
}): Promise<void> {
  if (!isTunnelUrl(input.url)) {
    await input.open(input.url);
    return;
  }
  try {
    const { openAttachmentInViewer, nativeViewerErrorMessage } =
      await import("../lib/attachmentDownload");
    await openAttachmentInViewer({
      uri: input.url,
      attachment: input.attachment,
      signal: new AbortController().signal,
    }).catch((cause: unknown) => {
      input.report(nativeViewerErrorMessage(cause));
    });
  } catch {
    input.report("The file could not be opened. Check the connection and try again.");
  }
}
