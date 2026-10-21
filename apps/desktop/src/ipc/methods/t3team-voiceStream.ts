import {
  DesktopVoiceStreamPushRequest,
  DesktopVoiceStreamStartRequest,
  DesktopVoiceStreamStartResult,
  DesktopVoiceStreamStopRequest,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { getDesktopVoiceStreamService } from "../../voice/t3team-voiceRuntime.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

export const startVoiceStream = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.START_VOICE_STREAM_CHANNEL,
  payload: DesktopVoiceStreamStartRequest,
  result: DesktopVoiceStreamStartResult,
  handler: Effect.fn("desktop.ipc.voice.stream.start")(function* (request) {
    return yield* Effect.promise(() => getDesktopVoiceStreamService().start(request));
  }),
});

export const pushVoiceStream = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.PUSH_VOICE_STREAM_CHANNEL,
  payload: DesktopVoiceStreamPushRequest,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.voice.stream.push")(function* (request) {
    yield* Effect.sync(() => getDesktopVoiceStreamService().push(request));
  }),
});

export const stopVoiceStream = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.STOP_VOICE_STREAM_CHANNEL,
  payload: DesktopVoiceStreamStopRequest,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.voice.stream.stop")(function* (request) {
    yield* Effect.sync(() => getDesktopVoiceStreamService().stop(request));
  }),
});
