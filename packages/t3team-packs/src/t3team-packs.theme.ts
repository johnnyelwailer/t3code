import * as Schema from "effect/Schema";

const Identifier = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/));
const CssColor = Schema.String.check(
  Schema.isPattern(/^(?:#[0-9a-fA-F]{3,8}|(?:oklch|rgb|rgba|hsl|hsla)\([^;{}]+\))$/),
);
const FontStack = Schema.String.check(Schema.isPattern(/^[^;{}]+$/));

const BrandAsset = Schema.String.check(
  Schema.isPattern(
    /^(?:data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+|[^\0;{}]+\.(?:svg|png|webp))$/i,
  ),
);
const BrandFontAsset = Schema.String.check(
  Schema.isPattern(
    /^(?:data:font\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+|[^\0;{}]+\.(?:ttf|otf|woff2?))$/i,
  ),
);
const OptionalBrandAsset = Schema.optionalKey(BrandAsset);
export const ThemeBrandAssets = Schema.Struct({
  mark: OptionalBrandAsset,
  markDark: OptionalBrandAsset,
  wordmark: OptionalBrandAsset,
  wordmarkDark: OptionalBrandAsset,
  /** Font used for headings only; body text keeps the theme sans stack. */
  displayFont: Schema.optionalKey(BrandFontAsset),
});
export type ThemeBrandAssets = typeof ThemeBrandAssets.Type;

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
  brand: Schema.optionalKey(ThemeBrandAssets),
  colors: Schema.Struct({ light: ThemeColorTokens, dark: ThemeColorTokens }),
  typography: Schema.optionalKey(
    Schema.Struct({
      sans: Schema.optionalKey(FontStack),
      mono: Schema.optionalKey(FontStack),
      /** Heading-only font stack; pairs with brand.displayFont. */
      display: Schema.optionalKey(FontStack),
    }),
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
  /**
   * Starting values for the client-side appearance settings a USER owns (Settings → Appearance /
   * Beta). Everything above is the theme itself; these are preferences, so a distribution may only
   * choose where they START. They are applied once and never re-applied over a later user choice.
   *
   * `sidebarLens` is the product concept rather than upstream's beta flag name: the fork ships no
   * control of its own, and `useT3TeamSidebarLens` is the single place that maps the lens onto
   * whichever switch upstream currently owns.
   */
  appearanceDefaults: Schema.optionalKey(
    Schema.Struct({
      sidebarLens: Schema.optionalKey(Schema.Literals(["code", "work"])),
      glassOpacity: Schema.optionalKey(
        Schema.Int.check(Schema.isBetween({ minimum: 40, maximum: 100 })),
      ),
    }),
  ),
});
export type ThemeDefinition = typeof ThemeDefinition.Type;
export const decodeThemeDefinition = Schema.decodeUnknownSync(ThemeDefinition);
export const defineTheme = <const T extends ThemeDefinition>(definition: T): T => definition;
