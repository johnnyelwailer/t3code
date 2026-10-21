import { DesktopVoiceHotkeyState } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopVoiceHotkey from "../../voice/t3team-DesktopVoiceHotkey.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

export const getVoiceHotkeyState = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.GET_VOICE_HOTKEY_STATE_CHANNEL,
  payload: Schema.Void,
  result: DesktopVoiceHotkeyState,
  handler: Effect.fn("desktop.ipc.voiceHotkey.getState")(function* () {
    return yield* (yield* DesktopVoiceHotkey.DesktopVoiceHotkey).state;
  }),
});
