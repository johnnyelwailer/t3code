import { VOICE_HOTKEY_TOGGLE_ACTION, type DesktopVoiceHotkeyState } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import { toElectronAccelerator } from "../snapShot/snapShot.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import {
  registerVoiceHotkey,
  VOICE_HOTKEY_CHORD,
  type VoiceHotkeyRegistration,
} from "./t3team-voiceHotkeyRegistration.ts";

/** A held key repeats its press; one physical press must toggle exactly once. */
const PRESS_COOLDOWN_NS = 300_000_000n;

export class DesktopVoiceHotkey extends Context.Service<
  DesktopVoiceHotkey,
  {
    readonly initialize: Effect.Effect<void>;
    readonly state: Effect.Effect<DesktopVoiceHotkeyState>;
  }
>()("@t3tools/desktop/voice/t3team-DesktopVoiceHotkey/DesktopVoiceHotkey") {}

export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  const runPromise = Effect.runPromiseWith(yield* Effect.context<never>());
  const accelerator = toElectronAccelerator(VOICE_HOTKEY_CHORD);
  let registration: VoiceHotkeyRegistration | undefined;
  let lastPressAt: bigint | undefined;

  const toggle = Effect.gen(function* () {
    const now = yield* Clock.currentTimeNanos;
    if (lastPressAt !== undefined && now - lastPressAt < PRESS_COOLDOWN_NS) return;
    lastPressAt = now;
    yield* desktopWindow.dispatchMenuAction(VOICE_HOTKEY_TOGGLE_ACTION, { reveal: false });
  }).pipe(Effect.ignoreCause, Effect.withSpan("desktop.voiceHotkey.toggle"));

  yield* Effect.addFinalizer(() => Effect.sync(() => registration?.close()));

  return DesktopVoiceHotkey.of({
    // Not awaited: a Wayland portal can sit on a consent prompt and must never hold up startup.
    initialize: Effect.sync(() => {
      void registerVoiceHotkey({
        platform: environment.platform,
        env: process.env,
        linuxAppId: environment.linuxDesktopEntryName.replace(/\.desktop$/, ""),
        onPress: () => void runPromise(toggle),
      }).then((registered) => {
        registration = registered;
      });
    }),
    state: Effect.sync(
      () => registration?.state() ?? { registered: false, accelerator, message: null },
    ),
  });
});

export const layer = Layer.effect(DesktopVoiceHotkey, make);
