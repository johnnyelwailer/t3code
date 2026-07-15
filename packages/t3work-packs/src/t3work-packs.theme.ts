import * as Schema from "effect/Schema";

const Identifier = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/));
const CssColor = Schema.String.check(
  Schema.isPattern(/^(?:#[0-9a-fA-F]{3,8}|(?:oklch|rgb|rgba|hsl|hsla)\([^;{}]+\))$/),
);
const FontStack = Schema.String.check(Schema.isPattern(/^[^;{}]+$/));

const OptionalColor = Schema.optionalKey(CssColor);
export const ThemeColorTokens = Schema.Struct({
  background: OptionalColor,
  foreground: OptionalColor,
  card: OptionalColor,
  cardForeground: OptionalColor,
  popover: OptionalColor,
  popoverForeground: OptionalColor,
  primary: OptionalColor,
  primaryForeground: OptionalColor,
  secondary: OptionalColor,
  secondaryForeground: OptionalColor,
  muted: OptionalColor,
  mutedForeground: OptionalColor,
  accent: OptionalColor,
  accentForeground: OptionalColor,
  destructive: OptionalColor,
  destructiveForeground: OptionalColor,
  border: OptionalColor,
  input: OptionalColor,
  ring: OptionalColor,
  info: OptionalColor,
  infoForeground: OptionalColor,
  success: OptionalColor,
  successForeground: OptionalColor,
  warning: OptionalColor,
  warningForeground: OptionalColor,
  appChromeBackground: OptionalColor,
});

export const ThemeDefinition = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  id: Identifier,
  name: Schema.String,
  productName: Schema.optionalKey(Schema.String),
  publisher: Schema.optionalKey(Schema.String),
  labels: Schema.optionalKey(Schema.Struct({ appName: Schema.optionalKey(Schema.String) })),
  defaultMode: Schema.optionalKey(Schema.Literals(["light", "dark", "system"])),
  colors: Schema.Struct({ light: ThemeColorTokens, dark: ThemeColorTokens }),
  typography: Schema.optionalKey(
    Schema.Struct({ sans: Schema.optionalKey(FontStack), mono: Schema.optionalKey(FontStack) }),
  ),
  shape: Schema.optionalKey(
    Schema.Struct({
      radius: Schema.optionalKey(
        Schema.String.check(Schema.isPattern(/^\d+(?:\.\d+)?(?:px|rem)$/)),
      ),
    }),
  ),
  density: Schema.optionalKey(
    Schema.Number.check(Schema.isBetween({ minimum: 0.875, maximum: 1.125 })),
  ),
});
export type ThemeDefinition = typeof ThemeDefinition.Type;
export const decodeThemeDefinition = Schema.decodeUnknownSync(ThemeDefinition);
export const defineTheme = <const T extends ThemeDefinition>(definition: T): T => definition;
