# Explainer

A player that walks a reader through a subject — a pull request, a branch, a set of files, or a
concept — as ordered, labelled steps of rich blocks. This folder is self-contained so it can move
into a Nexi Work pack: nothing outside it imports from it except the two wiring lines listed under
[Host wiring](#host-wiring).

## Model (`model/`)

`model/t3team-explainer.ts` is the entry point; it re-exports the rest. Effect Schema only — no
dependency on the host's contracts package.

- `T3TeamExplainer` — `version: 2`, a `subject` (`pr | branch | files | concept`), optional
  `headSha`, `summary`, optional `risk`/`reviewMinutes`, an optional explainer-level `map`, and
  `steps`.
- `T3TeamExplainerStep` — `id`, `kind` (`context | change | check | tests`), optional `label`,
  `caption`, `blocks`.
- `T3TeamExplainerBlock` — a union on `type`: `markdown`, `diff`, `code`, `map`, `sequence`, `shape`,
  `uiCompare`, `image`, `video`, `callout`, `keyValue`, `table`, `checklist`, `widget`. Every block
  has an `id`, an optional `layout` (`main | aside | full`) and an optional `detail` flag. Each
  block decodes on its own: an unknown or invalid block becomes `unsupported` and never fails the
  explainer.
- `T3TeamExplainerAnchor`, `T3TeamExplainerAskThread` — what a question points at, and its thread.
- `validateT3TeamExplainer(explainer)` — the cross-reference checks a schema cannot express. It
  returns structured issues (`severity`, `code`, `path`, `message`) a generator can repair.

The model is written for LLM output. Line numbers and hunk headers are derived, highlights are
substrings, and text has no hard maximum. Ranges are end-exclusive. Media sources are
`attachment:<id>` or small inline `data:` URLs, never remote URLs.

## Component API

```tsx
<ExplainerPlayer
  explainer={explainer}            // T3TeamExplainer
  status={{ kind: "ready" }}       // | { kind: "generating", expectedSteps } | { kind: "error", message }
  currentHeadSha="…"               // newer than explainer.headSha → stale banner, stale payloads
  threads={threads}                // T3TeamExplainerAskThread[]
  onAsk={({ anchor, question, threadId }) => …}
  onAddToChat={(selection) => …}   // PullRequestAgentSelectionInput, the PR panel's shape
  onOpenInCode={({ path, line, side, headSha }) => …}
  onRegenerate={() => …}
  resolveAttachment={(id) => url}  // for attachment:<id> media
  resolveWidget={(artifactId) => widget}
  widgetThreadRef={threadRef}
  autoPlay initialStep={0} stepMs={6500} className="…"
/>
```

The player fetches nothing. Data and every action come in as props.

### Callbacks a host provides

| Prop                | Needed for                               | Without it                       |
| ------------------- | ---------------------------------------- | -------------------------------- |
| `onAsk`             | Ask anywhere, replies, selection chip    | no Ask affordances               |
| `onAddToChat`       | "Add to chat" on cards and threads       | button hidden                    |
| `onOpenInCode`      | "Code" on diff blocks                    | button hidden                    |
| `onRegenerate`      | stale / failed banners                   | no regenerate button             |
| `resolveAttachment` | `attachment:` images, video, posters     | "not available here" placeholder |
| `resolveWidget`     | `widget` blocks that reference artifacts | placeholder                      |

## Host kit (`t3team-explainerHostKit.ts`)

This is the only file that imports from the host (`~/…`, `@t3tools/…`, the icon set). It is
the spec for a future pack UI kit:

- styling: `cn`
- UI primitives: `Alert`, `AlertTitle`, `AlertDescription`, `Badge`, `Button`, `Popover`,
  `PopoverPopup`, `Skeleton`, `Spinner`, `Table` (+ parts), `Textarea`, `Tooltip`,
  `TooltipTrigger`, `TooltipPopup`
- rich content: `HostMarkdown` (the chat's markdown renderer), `HostWidgetFrame` (the chat's
  sandboxed widget iframe)
- motion: `useMediaQuery`, `observeVisibleAnimation`
- icons: the lucide icons listed in the file
- types: `PullRequestAgentSelectionInput`, `ScopedThreadRef`, `HostWidget`

Other files import only `react`, `effect` (model), each other, and the host kit.

## Host wiring

These are the only places outside this folder that know about it:

- `t3team/t3team-index-global.css` imports `pr-explainer/t3team-explainer.css` (the motion
  utilities).
- `t3team/storybook/t3team-storybook-main.ts` adds `pr-explainer/stories/**` to the story globs.

## Extending

- **New block:** add a schema to `model/` and to `KNOWN_BLOCKS`, add a renderer in
  `t3team-ExplainerBlockBody.tsx`, and add a default layout in `t3team-explainerLayout.ts`.
  Older builds show it as `unsupported`.
- **New embeddable component:** register it in `t3team-explainerWidgetRegistry.tsx`.
