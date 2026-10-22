import {
  DEFAULT_VOICE_HOTKEY_CHORD,
  VOICE_HOTKEY_TOGGLE_ACTION,
  type ClientSettings,
  type DesktopVoiceHotkeyState,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import { makeVoiceHotkeyController } from "./t3team-voiceHotkeyController.ts";
import { registerVoiceHotkey } from "./t3team-voiceHotkeyRegistration.ts";

/** A held key repeats its press; one physical press must toggle exactly once. */
const PRESS_COOLDOWN_NS = 300_000_000n;

export class DesktopVoiceHotkey extends Context.Service<
  DesktopVoiceHotkey,
  {
    readonly initialize: Effect.Effect<void>;
    /** Re-registers the global shortcut when the chord in `settings` differs from the live one. */
    readonly configure: (settings: ClientSettings) => Effect.Effect<void>;
    readonly state: Effect.Effect<DesktopVoiceHotkeyState>;
  }
>()("@t3tools/desktop/voice/t3team-DesktopVoiceHotkey/DesktopVoiceHotkey") {}

const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
  const runPromise = Effect.runPromiseWith(yield* Effect.context<never>());
  let lastPressAt: bigint | undefined;

  const toggle = Effect.gen(function* () {
    const now = yield* Clock.currentTimeNanos;
    if (lastPressAt !== undefined && now - lastPressAt < PRESS_COOLDOWN_NS) return;
    lastPressAt = now;
    yield* desktopWindow.dispatchMenuAction(VOICE_HOTKEY_TOGGLE_ACTION, { reveal: false });
  }).pipe(Effect.ignoreCause, Effect.withSpan("desktop.voiceHotkey.toggle"));

  const controller = makeVoiceHotkeyController((chord) =>
    registerVoiceHotkey({
      chord,
      platform: environment.platform,
      env: process.env,
      linuxAppId: environment.linuxDesktopEntryName.replace(/\.desktop$/, ""),
      onPress: () => void runPromise(toggle),
    }),
  );
  yield* Effect.addFinalizer(() => Effect.sync(controller.close));

  return DesktopVoiceHotkey.of({
    initialize: clientSettings.get.pipe(
      Effect.map(Option.getOrUndefined),
      Effect.orElseSucceed(() => undefined),
      Effect.flatMap((stored) =>
        Effect.sync(() => controller.apply(stored?.voiceHotkeyChord ?? DEFAULT_VOICE_HOTKEY_CHORD)),
      ),
    ),
    configure: (settings) => Effect.sync(() => controller.apply(settings.voiceHotkeyChord)),
    state: Effect.sync(controller.state),
  });
});

export const layer = Layer.effect(DesktopVoiceHotkey, make);
