import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const decodePreset = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ flavor: Schema.String })),
);

/** Flavors that replace the installed app in place. `live` is the historical name;
 * `stable` is the flavor desktop-v* tags now ship. Side-by-side nightlies never update. */
const IN_PLACE_UPDATE_FLAVORS = new Set(["live", "stable"]);

/** True when the packaged preset is a flavor that should use the GHE in-place update feed. */
export const isLiveFlavorPreset = (presetText: string | undefined): boolean =>
  presetText !== undefined &&
  Option.exists(decodePreset(presetText), (preset) => IN_PLACE_UPDATE_FLAVORS.has(preset.flavor));
