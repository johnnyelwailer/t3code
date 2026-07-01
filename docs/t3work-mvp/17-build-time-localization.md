# Epic 17: Build-Time Localization Spike

## Goal

Add a pack-aware localization path for `t3work` without hand-editing existing T3 Code UI
source files.

The first goal is not upstream-ready full i18n. The first goal is a reversible pipeline
experiment that can prove whether another display language can be shipped for the
`t3work` surface while preserving the upstream source tree. Under the pack-driven vision,
workspace packs should be able to provide locale strings and terminology overrides; build
time remains useful for core/distribution strings, while pack strings may need runtime
catalog loading.

## Current Context

The upstream app has no active full localization effort. The closest related work is
bidirectional text handling for RTL user content, not translated app chrome:

- `pingdotgg/t3code#1463`: Chinese i18n request, closed as not planned because the
  maintainers do not currently have capacity.
- `pingdotgg/t3code#1771`: open proposal to adopt logical CSS and bidi-safe message
  rendering.
- `pingdotgg/t3code#2128`: open PR for `dir="auto"` and logical text-direction fixes.

The local web app is a Vite + React app with a Babel stage already present in
`apps/web/vite.config.ts`. A build-time localization experiment should plug into that
pipeline instead of introducing runtime DOM translation.

## Existing Solutions Reviewed

### Wuchale

Wuchale is the closest match to the "do not touch source files" constraint. It extracts
plain JSX/TSX text into PO catalogs, compiles catalogs, then transforms JSX at build time
to indexed runtime lookups.

Useful signals:

- markets itself as "zero code changes"
- supports React, TypeScript, and JSX
- uses PO files by default
- transforms natural JSX such as `<p>Hello world!</p>` into runtime translation lookups

Risk:

- newer, less proven than FormatJS or Lingui
- index-based catalogs may make review harder unless we preserve source locations and
  default text in generated metadata
- needs careful exclusions for code blocks, provider/model names, file paths, and test
  fixtures

Reference: https://wuchale.dev/

### Paraglide JS

Paraglide is a strong Vite-native build-time i18n library. It compiles messages into
tree-shakeable functions and has a simple Vite plugin.

Useful signals:

- Vite-first
- type-safe message functions
- small bundles through tree shaking
- works with React and TanStack Router

Risk:

- still expects explicit message calls such as `m.greeting()`
- good target runtime, but not enough by itself for zero-source retrofitting

Reference: https://inlang.com/m/gerre34r/library-inlang-paraglideJs/vite

### FormatJS

FormatJS has mature extraction and Babel tooling. It can extract messages from
`FormattedMessage`, `defineMessage`, and `intl.formatMessage`, and can auto-generate
stable IDs.

Useful signals:

- mature ICU MessageFormat support
- Babel plugin and CLI extraction flow
- explicit ID interpolation
- good validation and lint ecosystem

Risk:

- requires source-level message descriptors or a custom pre-transform that creates them
- heavier runtime model than a narrow `t3work` experiment likely needs

References:

- https://formatjs.github.io/docs/tooling/babel-plugin/
- https://formatjs.github.io/docs/getting-started/message-extraction/

### Lingui And SayKit

Lingui and SayKit both fit compile-time extraction workflows. They are better candidates
for a proper source-level i18n migration than for zero-source retrofitting.

Useful signals:

- source-adjacent message authoring
- ICU/plural support
- extraction and compilation commands

Risk:

- require wrapping strings or using macros/components
- would produce source churn if applied directly to existing T3 files

References:

- https://lingui.dev/
- https://saykit.js.org/

## Recommended Spike

Use a Wuchale-style Vite/Babel transform as the first experiment. If Wuchale fits the
current Vite/Rolldown/Babel stack, use it directly. If not, build a minimal local
prototype plugin with the same architecture.

The spike should only target `apps/web/src/t3work/**` first. Do not translate the whole
T3 Code shell in the first pass.

## Proposed Pipeline

1. Extract
   - Scan `apps/web/src/t3work/**/*.{ts,tsx}`.
   - Find JSX text nodes and safe string attributes such as `title`, `aria-label`,
     `placeholder`, and button labels.
   - Skip tests, fixtures, generated files, code snippets, provider IDs, model IDs, file
     paths, route paths, and protocol strings.

2. Catalog
   - Generate `apps/web/locales/t3work/en.po` or `en.json`.
   - Record source file, line, default English text, and a stable content hash.
   - Keep generated files reviewable.

3. Translate
   - Add one pilot locale, preferably `de` because it is LTR and exposes longer-label
     layout risk.
   - Keep untranslated strings falling back to English.

4. Compile
   - Compile catalogs into generated modules under
     `apps/web/src/t3work/localization/generated/`.
   - Do not hand-edit generated modules.

5. Transform
   - Add a Vite plugin or Babel plugin that rewrites extracted JSX during build.
   - Example:

     ```tsx
     <Button>Create project</Button>
     ```

     becomes:

     ```tsx
     <Button>{t3workMessage("hash", "Create project")}</Button>
     ```

6. Select Locale
   - Start with an environment variable:

     ```bash
     T3WORK_LOCALE=de bun --filter @t3tools/web build
     ```

   - Later, add a client setting only after the build-time path is proven.

7. Verify
   - Run browser checks on the `t3work` entry surfaces.
   - Compare English and German screenshots.
   - Check long labels, empty states, dialogs, tooltips, and narrow layouts.

## Scope Rules

Translate:

- `t3work` navigation labels
- headings
- buttons
- form labels
- placeholders
- empty states
- tooltips
- reviewable mutation UI copy

Do not translate:

- code blocks
- terminal text
- provider names
- model names
- file paths
- branch names
- commands
- Jira issue keys
- user-authored content
- assistant-authored content

## Validation Gates

The spike is complete only when:

- `bun fmt` passes
- `bun lint` passes
- `bun typecheck` passes
- `node t3work-additive-guard.mjs` passes
- English build still renders unchanged
- pilot locale build renders translated `t3work` chrome
- missing translations fall back to English
- generated catalogs are deterministic across repeated builds

## Decision Points

After the spike, decide:

1. Keep zero-source build-time localization for `t3work` only.
2. Switch to explicit source-level i18n for new `t3work` components.
3. Drop the experiment if transform risk is higher than maintaining explicit message
   calls.

The default recommendation is option 1 for experimentation, then option 2 for stable
new `t3work` UI if localization becomes a real product requirement.
