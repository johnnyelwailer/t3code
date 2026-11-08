import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const decodePreset = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ flavor: Schema.String })),
);

/** The `live` flavor is the one that replaces the installed app; side-by-side nightlies never update. */
export const isLiveFlavorPreset = (presetText: string | undefined): boolean =>
  presetText !== undefined &&
  Option.exists(decodePreset(presetText), (preset) => preset.flavor === "live");
