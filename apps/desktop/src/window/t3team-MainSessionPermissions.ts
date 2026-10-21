import type * as Electron from "electron";

export type MainSessionPermissionRequest = {
  readonly permission: string;
  readonly requestingUrl: string;
  readonly mediaTypes?: readonly string[];
};

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Electron grants every permission to a session that has no handler, and the app relies on that for
 * notifications, clipboard access and display capture, so only `media` is narrowed here: the app's
 * own renderer may use the microphone (voice dictation); video capture and any other origin may
 * not. Every other permission stays as Electron decides it by default, which is to grant.
 */
export function isMainSessionPermissionAllowed(
  request: MainSessionPermissionRequest,
  applicationUrl: string,
): boolean {
  if (request.permission !== "media") return true;
  if (request.mediaTypes?.some((type) => type !== "audio")) return false;
  const requesting = originOf(request.requestingUrl);
  return requesting !== null && requesting === originOf(applicationUrl);
}

/** Request and check handlers must agree: `enumerateDevices` and device labels use the check. */
export function installMainSessionPermissions(
  session: Pick<Electron.Session, "setPermissionRequestHandler" | "setPermissionCheckHandler">,
  applicationUrl: string,
): void {
  session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    callback(
      isMainSessionPermissionAllowed(
        {
          permission,
          requestingUrl: details.requestingUrl,
          ...("mediaTypes" in details && details.mediaTypes
            ? { mediaTypes: details.mediaTypes }
            : {}),
        },
        applicationUrl,
      ),
    );
  });
  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) =>
    isMainSessionPermissionAllowed(
      {
        permission,
        requestingUrl: details.requestingUrl || requestingOrigin,
        ...("mediaType" in details && details.mediaType && details.mediaType !== "unknown"
          ? { mediaTypes: [details.mediaType] }
          : {}),
      },
      applicationUrl,
    ),
  );
}
