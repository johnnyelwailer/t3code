# Theme Packs v1

Theme packs let a distribution deeply restyle and name the t3team shell without executing pack
code or injecting arbitrary CSS.

## Contract

A theme asset declares `schemaVersion: 1`, an ID and name, plus:

- semantic light and dark color tokens
- product terminology (`labels.appName`)
- optional product and publisher names
- default light, dark, or system mode
- UI and code font stacks
- global radius
- bounded density from `0.875` through `1.125`

The manifest must declare `theme:v1`. The resolved highest-precedence theme becomes the active
environment appearance. User and project packs can therefore override a distribution theme using
the normal pack precedence model.

## Semantic colors

Supported tokens cover the full existing shell vocabulary: background, foreground, card, popover,
primary, secondary, muted, accent, destructive, border, input, ring, info, success, warning, their
foreground pairs, and browser/app chrome.

Themes provide separate `colors.light` and `colors.dark` maps. The user's Light/Dark/System setting
still controls the mode; switching mode does not replace the active product theme.

## Safety

Theme files are data-only. Values are schema-decoded before activation. Colors accept hex and
bounded functional color syntax, font stacks reject CSS delimiters, radius accepts only `px` or
`rem`, and density is bounded. Unknown semantic tokens are never applied by the client.

The web host renders a generated allowlisted style block. Packs cannot provide selectors, URLs,
scripts, HTML, or arbitrary CSS properties.

## Product terminology

`labels.appName` owns the primary shell label, for example `Nexi` instead of `T3 Team`. Labels are
explicit slots rather than global string replacement. This avoids accidental changes in technical
messages, accessibility labels, persisted data, and API contracts.

The obsolete `Work shell` header badge is not part of Theme v1 and is removed from the base UI.
