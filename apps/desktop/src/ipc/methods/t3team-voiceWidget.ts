import { DesktopVoiceWidgetCommand, DesktopVoiceWidgetSnapshot } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Electron from "electron";

import * as DesktopEnvironment from "../../app/DesktopEnvironment.ts";
import { getDesktopUrl } from "../../electron/ElectronProtocol.ts";
import { microphoneSettingsUrl } from "../../voice/t3team-microphoneSettingsUrl.ts";
import { getVoiceWidgetService } from "../../voice/t3team-voiceWidgetRuntime.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

class MicrophoneSettingsUnavailableError extends Schema.TaggedError<MicrophoneSettingsUnavailableError>()(
  "MicrophoneSettingsUnavailableError",
  { platform: Schema.String },
) {
  override get message(): string {
    return `The ${this.platform} platform has no microphone settings page to open.`;
  }
}

const widgetService = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  return getVoiceWidgetService({
    applicationUrl: getDesktopUrl(environment.isDevelopment),
    preloadPath: environment.preloadPath,
  });
});

export const publishVoiceWidget = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.PUBLISH_VOICE_WIDGET_CHANNEL,
  payload: DesktopVoiceWidgetSnapshot,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.voice.widget.publish")(function* (snapshot, event) {
    if (event === undefined) return;
    (yield* widgetService).publish(event.sender.id, snapshot);
  }),
});

export const sendVoiceWidgetCommand = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SEND_VOICE_WIDGET_COMMAND_CHANNEL,
  payload: DesktopVoiceWidgetCommand,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.voice.widget.command")(function* (command, event) {
    if (event === undefined) return;
    (yield* widgetService).command(event.sender.id, command);
  }),
});

export const openMicrophoneSettings = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.OPEN_MICROPHONE_SETTINGS_CHANNEL,
  payload: Schema.Void,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.voice.openMicrophoneSettings")(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const url = microphoneSettingsUrl(environment.platform);
    if (url === null) {
      return yield* new MicrophoneSettingsUnavailableError({ platform: environment.platform });
    }
    yield* Effect.promise(() => Electron.shell.openExternal(url));
  }),
});
