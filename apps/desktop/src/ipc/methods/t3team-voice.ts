import {
  DesktopVoicePrepareRequest,
  DesktopVoicePrepareResult,
  DesktopVoiceTranscribeRequest,
  DesktopVoiceTranscribeResult,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { getDesktopVoiceService } from "../../voice/t3team-voiceRuntime.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

export const prepareVoiceTranscriber = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.PREPARE_VOICE_TRANSCRIBER_CHANNEL,
  payload: DesktopVoicePrepareRequest,
  result: DesktopVoicePrepareResult,
  handler: Effect.fn("desktop.ipc.voice.prepare")(function* (request) {
    return yield* Effect.promise(() => getDesktopVoiceService().prepare(request));
  }),
});

export const transcribeVoice = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.TRANSCRIBE_VOICE_CHANNEL,
  payload: DesktopVoiceTranscribeRequest,
  result: DesktopVoiceTranscribeResult,
  handler: Effect.fn("desktop.ipc.voice.transcribe")(function* (request) {
    return yield* Effect.promise(() => getDesktopVoiceService().transcribe(request));
  }),
});
