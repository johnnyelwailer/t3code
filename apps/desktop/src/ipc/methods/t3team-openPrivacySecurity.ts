import * as Electron from "electron";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { MAC_PRIVACY_SECURITY_SETTINGS_URL } from "../../permissions/t3team-privacySettingsUrl.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

/**
 * Opens macOS Privacy & Security from a user-clicked button. A `.webloc` of
 * this URL is refused on macOS 27.2, with or without quarantine.
 */
export const openPrivacySecurity = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.OPEN_PRIVACY_SECURITY_CHANNEL,
  payload: Schema.Void,
  result: Schema.Boolean,
  handler: Effect.fn("desktop.ipc.openPrivacySecurity")(function* () {
    return yield* Effect.promise(() =>
      Electron.shell.openExternal(MAC_PRIVACY_SECURITY_SETTINGS_URL).then(
        () => true,
        () => false,
      ),
    );
  }),
});
