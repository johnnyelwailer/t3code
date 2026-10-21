import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  ClientSettingsPatch,
  ClientSettingsSchema,
  DEFAULT_CLIENT_SETTINGS,
  ServerSettingsPatch,
} from "./settings.ts";
import { DEFAULT_VOICE_HOTKEY_CHORD } from "./t3team-voiceHotkey.ts";

const decodeClientSettings = Schema.decodeUnknownSync(ClientSettingsSchema);
const encodeClientSettings = Schema.encodeSync(ClientSettingsSchema);
const decodeClientSettingsPatch = Schema.decodeUnknownSync(ClientSettingsPatch);
const decodeServerSettingsPatch = Schema.decodeUnknownSync(ServerSettingsPatch);

const CTRL_SHIFT_V = {
  key: "v",
  metaKey: false,
  ctrlKey: true,
  shiftKey: true,
  altKey: false,
  modKey: false,
};

describe("ClientSettings voice hotkey chord", () => {
  it("defaults to Ctrl+Alt+Space", () => {
    expect(decodeClientSettings({}).voiceHotkeyChord).toEqual(DEFAULT_VOICE_HOTKEY_CHORD);
    expect(DEFAULT_CLIENT_SETTINGS.voiceHotkeyChord).toEqual({
      key: " ",
      metaKey: false,
      ctrlKey: true,
      shiftKey: false,
      altKey: true,
      modKey: false,
    });
  });

  it("keeps Space as the key of the default chord through the stored settings", () => {
    const stored = encodeClientSettings(decodeClientSettings({}));
    expect(stored.voiceHotkeyChord?.key).toBe(" ");
    expect(decodeClientSettings(stored).voiceHotkeyChord).toEqual(DEFAULT_VOICE_HOTKEY_CHORD);
  });

  it("round-trips a changed chord through the stored settings", () => {
    const stored = encodeClientSettings(decodeClientSettings({ voiceHotkeyChord: CTRL_SHIFT_V }));
    expect(decodeClientSettings(stored).voiceHotkeyChord).toEqual(CTRL_SHIFT_V);
  });

  it("accepts the chord as a settings patch", () => {
    expect(decodeClientSettingsPatch({ voiceHotkeyChord: CTRL_SHIFT_V })).toEqual({
      voiceHotkeyChord: CTRL_SHIFT_V,
    });
  });

  it("rejects a chord with no modifier, which would steal a plain key from every app", () => {
    const bare = { ...CTRL_SHIFT_V, ctrlKey: false, shiftKey: false };
    expect(() => decodeClientSettingsPatch({ voiceHotkeyChord: bare })).toThrow(/modifier/);
    expect(() => decodeClientSettings({ voiceHotkeyChord: bare })).toThrow(/modifier/);
  });
});

describe("ServerSettings voice transcriber patch", () => {
  it("accepts model, model path and language independently", () => {
    expect(
      decodeServerSettingsPatch({
        voice: {
          transcriber: { model: "small", modelPath: "C:/models/ggml-small.bin", language: "de" },
        },
      }),
    ).toEqual({
      voice: {
        transcriber: { model: "small", modelPath: "C:/models/ggml-small.bin", language: "de" },
      },
    });
    expect(decodeServerSettingsPatch({ voice: { transcriber: { language: "en" } } })).toEqual({
      voice: { transcriber: { language: "en" } },
    });
  });

  it("accepts an empty model as Automatic but refuses an empty language", () => {
    expect(decodeServerSettingsPatch({ voice: { transcriber: { model: "" } } })).toEqual({
      voice: { transcriber: { model: "" } },
    });
    expect(decodeServerSettingsPatch({ voice: { transcriber: { model: "  " } } })).toEqual({
      voice: { transcriber: { model: "" } },
    });
    expect(() => decodeServerSettingsPatch({ voice: { transcriber: { language: "" } } })).toThrow();
  });
});
