# Epic 24: Tiered Message Composition

**Status:** Proposal / draft. Companion to Epic 08 (Rich Artifacts) and Epic 19 (Workspace
Miniapps). Not yet authoritative — open for iteration.

## Purpose

Give agents in `t3work` a richer expressive surface than plain markdown in chat
messages, without sacrificing streaming, persistence, security, or the additive guard.

The goal: when text is the right answer, write text; when a tiny inline flourish reads
better than a paragraph, inline it; when a full interactive surface is warranted, mount
one. Three tiers, three appropriate mechanisms.

## Why now

Doc 08 already specifies MDX as a format for `RichArtifact` (durable side-panel docs).
Doc 19 already specifies miniapps with a `components` manifest field as the view
primitive (mounted via `t3workExt.view` on a message). What is missing is the
**in-message prose layer** — the gap between "raw markdown" and "full miniapp" where
an agent wants to drop a `<Sparkline>` mid-sentence or reference a ticket inline as a
typed pill.

This epic closes that gap while keeping the existing two surfaces intact.

## Three tiers

| Tier                        | Where                    | What lives here                                       | Mechanism                                                                                                                   |
| --------------------------- | ------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **T1: inline prose MDX**    | `Message.content`        | Visual flourishes, refs, micro-vis, inline structures | tolerant streaming MDX renderer + whitelisted component registry                                                            |
| **T2: structured view**     | `Message.t3workExt.view` | Heavy, stateful, interactive components               | **T2a:** registered miniapp invocation (Epic 19) · **T2b:** on-the-fly composer subagent that authors a new view in seconds |
| **T3: persistent artifact** | `RichArtifact` (Epic 08) | Durable documents persisted to workspace              | MDX/HTML/blocks formats                                                                                                     |

The dividing line between T1 and T2 is **state + interactivity**, not visual fanciness.
A `<Chart>` with literal hard-coded data points is T1-eligible (renders once, no
bindings, fails-safe to a table). A `<Chart>` bound to live project context with click
handlers and zoom is T2.

The agent does not pick the tier directly. Each component is registered against one or
both facades; the agent sees a per-surface catalog and picks a component name. The
registry decides which tier renders it.

## T1: Inline prose MDX

### Constraints

- **Stateless.** No `useState`, no `useEffect`. Pure render from props.
- **Low prop arity.** Literals or short JSON in MDX attributes; no expressions referring
  to runtime context.
- **Degradeable.** If JSX fails to parse mid-stream, fallback text or a placeholder
  appears; never crashes the message.
- **Fast at idle.** Rendered per message in a chat list potentially 200+ items deep —
  must amortize to free at idle. Render cost on first encounter is bounded but not
  required to be zero (see _loading strategy_ below).
- **Searchable.** Each component declares a `fallback` text shape used for search
  index, copy-paste, and screen readers.
- **Accessible.** Required `aria-label` derivation (often the fallback text).

### Loading strategy

Each T1 widget declares `loading: "eager" | "lazy"`:

- `"eager"` (default) — bundled with the chat renderer; instant render. Reserved for
  truly featherweight widgets (badges, refs, sparkline SVG, callouts).
- `"lazy"` — the renderer dynamically imports the widget module on first encounter
  in the session and shows the `fallback` text until the module resolves. Used by
  widgets that are conceptually T1 (stateless, single-source-of-truth prop) but carry
  a heavy library (Mermaid, KaTeX, future text-DSL widgets). Once loaded, subsequent
  instances render synchronously.

The `loading` knob is what makes Mermaid-class widgets fit T1 without bloating the
chat bundle. Interactive diagrams (click handlers, node selection, live binding)
remain T2 — the loading knob is a perf concession, not a state-or-interactivity
escape hatch.

### Catalog

Organized by purpose. Names are proposals; final names land via SDK helper
`defineInlineWidget`.

**In-app references** — typed pills that link or hover-preview into the app.

- `<TicketRef id="ABC-123" />` — Jira/provider ticket link with status colour and hover card.
- `<ThreadRef id="…" />` — link to another conversation; shows title + last activity.
- `<ArtifactRef id="…" />` — link to a `RichArtifact` (Epic 08).
- `<RecipeRef id="…" />` — link to a recipe; optional `runnable` flag turns it into a launcher.
- `<RunRef id="…" />` — link to a workflow run (Epic 16 instance directory).
- `<ProjectRef id="…" />`, `<UserRef id="…" />`, `<SkillRef id="…" />`, `<DocRef path="…" />`.
- `<FileRef path="src/foo.ts" line="42" />` — file/line link respecting existing
  `normalizeMarkdownLinkDestination` + `rewriteMarkdownFileUriHref` plumbing.
- `<CommitRef sha="…" />`, `<PrRef num="…" repo="…" />`, `<BranchRef name="…" />`.
- `<ResourceRef kind="…" id="…" />` — generic catch-all backed by the existing
  `ResourceRef` model (Epic 13).

**Status / metadata badges** — atomic pills, typically inline with prose.

- `<Badge tone="success|warning|danger|info|neutral">label</Badge>`
- `<Status state="green|yellow|red|grey" label="…" />` — coloured dot + label.
- `<Pill>generic short label</Pill>`
- `<Kbd>cmd+k</Kbd>` — keyboard shortcut.
- `<CIBadge status="passing|failing|pending" />` — build status pill.
- `<TestBadge passed="12" failed="0" skipped="3" />` — test counts.
- `<CoverageBadge percent="74" delta="+2" />`
- `<RiskBadge severity="low|medium|high|critical" />`
- `<PriorityBadge level="P0|P1|P2|P3" />`
- `<EnvBadge env="prod|staging|dev" />`

**Inline metrics & emphasis** — single values with formatting.

- `<Metric label="Latency" value="142" unit="ms" delta="-12" />` — KPI tile, single line.
- `<Trend direction="up|down|flat" magnitude="12%" />` — arrow + delta.
- `<Duration ms="86400000" />` — humanized ("1 day").
- `<Timestamp at="2026-05-29T10:00:00Z" relative />` — humanized + tooltip absolute.
- `<FileSize bytes="1048576" />` — humanized.
- `<Money currency="USD" value="1299.99" />` — formatted money.
- `<Count value="1238" />` — locale-aware number formatting.
- `<Percent value="0.742" />` — formatted percent.
- `<DiffStat add="12" del="3" />` — `+12 −3` chip.

**Micro visualizations** — one-line charts that fit in prose. SVG-only, no JS heaviness.

- `<Sparkline data="1,2,3,5,4,6,8" />` — single line micro chart.
- `<Bar value="0.7" />` — single horizontal progress bar.
- `<Meter min="0" max="100" value="74" thresholds="50,80" />` — three-zone meter.
- `<Gauge value="0.6" />` — small radial gauge.
- `<Ring percent="74" />` — progress ring.
- `<HeatStrip data="0,1,2,3,2,1,0,4" />` — one-row heatmap; e.g. commits/day.
- `<DotPlot data="…" />` — density dots.
- `<Stars rating="3.5" />` — star rating.
- `<Stack values="12,5,3" labels="a,b,c" />` — stacked single bar (mix).

**Annotations** — block-level emphasis inside prose.

- `<Callout type="info|warning|danger|success|note" title="…">body</Callout>`
- `<Note>side comment</Note>`
- `<Definition term="…">explanation</Definition>` — inline glossary.
- `<Mention user="…" />` — `@user` pill with avatar.
- `<Quote source="…">quoted text</Quote>`
- `<Spoiler>hidden until clicked</Spoiler>`

**Inline structures** — compact grouped data.

- `<KeyValueList>` with `<KV label="…" value="…" />` children — block of label:value pairs.
- `<MiniTable>` with `<MTRow>` / `<MTCell>` — small inline table (≤6 rows, ≤4 cols);
  taller tables are T2 `<Table>`.
- `<Checklist>` with `<Check done|todo>` items — inline ticked list.
- `<Steps>` with `<Step status="done|current|pending">` — numbered progress list.
- `<Tags>` with `<Tag>` children — chip cloud.
- `<Avatars users="…" max="5" />` — overlapping avatar stack with overflow count.
- `<Timeline compact>` with `<Event at="…" label="…" />` — micro timeline (taller
  interactive timeline is T2).
- `<KbdSequence>` — chord display.

**Code & diff (inline)** — tiny code surfaces; full editors live in T2.

- `<CodeRef expr="user.name" file="…" />` — inline code with goto-def on click.
- `<InlineDiff>` containing `<DiffLine kind="+|−|context" />` — single hunk.
- `<SnippetLine path="…" line="…" />` — pinned source line preview.
- `<Symbol kind="fn|class|var" name="…" />` — typed symbol reference.

**Text-DSL widgets (lazy-loaded)** — stateless source-to-render DSLs that earn T1
semantics (single string prop, naturally searchable, fallback is the source itself)
but use the `loading: "lazy"` strategy to keep the eager bundle small.

- `<Mermaid source="…" />` — Mermaid diagrams (sequence, class, ER, flowchart, gantt,
  state, mindmap, etc.). Stateless; the source string is the entire input. Fallback
  is the source rendered as a code block. Interactive variants (click handlers, node
  selection) are T2 (`<Flowchart>`, `<Sequence>`).
- `<Math source="…" display="inline|block" />` — KaTeX math expression. Fallback is
  the raw LaTeX in a code span.
- `<Dot source="…" />` — Graphviz DOT diagram. Same shape as `<Mermaid>`; renders via
  a WASM Graphviz build, lazy.
- `<Music source="…" />` — ABC or LilyPond fragment (future / optional).
- `<Chemistry source="…" />` — SMILES / molfile / KaTeX-style chemical formula
  rendering (future / optional).

These are the only T1 widgets allowed to declare `loading: "lazy"`. Anything that
needs state, effects, or live bindings belongs in T2 regardless of its visual
footprint.

### Streaming behaviour

T1 MDX renders through `safe-mdx`'s incremental tail parser. Stable prefix (any
component whose closing tag has streamed) renders eagerly; the live tail shows a
shimmer until its closing tag arrives or the stream ends. On stream end with still-
invalid MDX, the broken tail falls back to its raw text. No background fixer agent.

### Failure modes

- Unknown component name → render fallback text + a small "unknown component" affordance
  (logged for catalog gap detection).
- Invalid prop type → render fallback text from `fallback` prop or component default.
- Missing required ref target (e.g. `<TicketRef>` for a ticket that no longer exists)
  → render the ID as plain text with a strikethrough; do not crash.

## T2: Structured view

### Constraints

- **Full React.** Hooks, effects, suspense, error boundaries.
- **Bound to context.** May read `Queryable<T>` collections, react to context changes,
  call tools through the broker.
- **Carried structurally.** Invoked via `t3workExt.view` on the message envelope; props
  are validated by schema, not free-typed by the agent.
- **Sandbox-aware.** Stage-1 trusted today; stage-2 sandboxed later. Heavy components
  declared with `requiresStage2: true` are gated behind that future flag.

### Catalog

Organized by domain. Each entry would be registered via `defineConversationCard` (or
`defineArtifactRenderer` / other surface-specific helper) under Epic 19's
`define*` SDK. Existing Epic 08 `ArtifactBlock` kinds collapse into T2 components.

**Charts & analytics**

- `<Chart kind="line|bar|area|scatter|pie|donut" data="…" />` — primary chart family.
- `<MultiChart>` — overlaid series with shared axes.
- `<Histogram />`, `<BoxPlot />`, `<Violin />`, `<DotMatrix />`.
- `<Heatmap />` — full 2D heatmap (taller than a `<HeatStrip>`).
- `<CalendarHeatmap />` — GitHub-contributions style.
- `<Funnel />` — conversion funnel.
- `<Sankey />` — flow diagram.
- `<Treemap />`, `<Sunburst />`, `<Voronoi />`.
- `<Pareto />`, `<WaterfallChart />`, `<RadarChart />`.
- `<Dashboard>` containing other charts — composition primitive.

**Diagrams & flows** (interactive — static Mermaid/DOT live in T1)

- `<Flowchart nodes edges onNodeClick />` — typed flowchart with click handlers and
  selection state.
- `<Sequence />` — sequence diagram.
- `<OrgChart />`, `<TreeView />`.
- `<Network />` — force-directed graph.
- `<KGraph />` — knowledge graph (semantic relations).
- `<Gantt />` — interactive Gantt chart.
- `<Roadmap />` — swimlane roadmap.
- `<DependencyGraph />` — package/module deps viz.
- `<StateMachine />` — XState-style chart.

**Geographic & spatial**

- `<MapView center zoom layers />` — full Leaflet/MapLibre map.
- `<GeoHeatmap />` — geographic density.
- `<Globe />` — 3D globe (R3F).
- `<Region area />` — territory selector.

**3D, AR & graphics (react-three-fiber)**

- `<ThreeScene />` — generic R3F mount with declared lights/camera.
- `<Model3D src="…glb" />` — glTF/GLB viewer with orbit controls.
- `<PointCloud data="…" />`.
- `<ARView />` — WebXR scene (stage-2 sandbox required).
- `<Volume />` — volumetric data viewer (e.g. medical/scientific).
- `<Shader frag="…" />` — fragment-shader sandbox.
- `<Particles config />` — particle system.
- `<Plot3D />` — 3D scatter/surface plot.

**Animation & video (Framer Motion / Lottie / Remotion)**

- `<Reveal />` — typed-text reveal of explanatory content.
- `<Animation lottie="…" />` — Lottie embed.
- `<Motion preset="…" />` — Framer Motion preset animation surface.
- `<Reel remotion="…" />` — pre-rendered Remotion video clip (chat-perf-aware: the
  source clip is rendered offline; the chat shows the rendered MP4, not live Remotion).
- `<Carousel />`, `<Slideshow />`.
- `<TickerBoard />` — flip-board animated stats.

**Media**

- `<Video src controls />` — video player with chapter markers.
- `<Audio src waveform />` — audio player with generated waveform.
- `<Image src zoom annotate />` — image with zoom + annotation overlay.
- `<ImageDiff before after mode="slider|onion" />` — visual diff.
- `<Pdf src page />` — PDF preview.
- `<Camera />` — live camera tile (stage-2).
- `<Screen />` — embedded screen share / iframe-sandboxed live preview.

**Forms & inputs (interactive)**

- `<Form schema submit />` — full form generated from JSON Schema; validated.
- `<Wizard steps />` — multi-step form with progress.
- `<Survey questions />` — questionnaire with scoring.
- `<DateRange />`, `<DatePicker />`.
- `<Slider min max value />`, `<RangeSlider />`.
- `<ColorPicker />`, `<Tags editable />`, `<Combobox options />`.
- `<Search index live />` — embedded search box scoped to a corpus.

**Decisions & approvals**

- `<Approval diff actions />` — diff + approve/reject/comment; ties into the
  workflow `collect-input` step (Epic 16).
- `<PickOne options />` — single-choice prompt.
- `<MultiSelect options />` — multi-choice prompt.
- `<Vote options multi />` — open vote panel.
- `<Rating scale />` — 1–N rating input.
- `<Confirm danger />` — destructive op confirmation; routes through a recipe rather
  than ad-hoc dialog (per Epic 19 "no ad-hoc confirmation dialogs in the UI" rule).

**Rich content blocks** (Epic 08 block kinds expressed as T2 components)

- `<Plan steps editable />` — interactive plan with statuses; persisted as a plan
  artifact when saved.
- `<TestMatrix cases />` — interactive test matrix; ties into provider test cases.
- `<RiskBoard items />` — risk register with severity/probability/mitigation.
- `<StatusBoard columns items />` — kanban-style status board.
- `<Timeline events interactive />` — interactive timeline (the taller cousin of T1
  `<Timeline compact>`).
- `<Checklist persistent />` — long-form checklist that persists state to an artifact.
- `<DecisionLog entries />` — ADR-style decision log.
- `<ChangelogPreview entries />` — preview a generated changelog.
- `<MutationPreview mutation />` — preview an external system mutation before commit
  (e.g. "post this comment to Jira"; ties into Epic 07).

**Code surfaces**

- `<Diff hunks interactive />` — full multi-file diff with comments + line-level
  actions; reuses the existing `@pierre/diffs` highlighter pipeline.
- `<CodeWalk steps />` — guided code tour with anchor steps.
- `<CodeEditor language value onSave />` — Monaco/CodeMirror embed.
- `<Lab runnable />` — sandboxed code playground (stage-2 in serious form).
- `<Notebook cells />` — Jupyter-style notebook.
- `<Repl lang />` — interactive REPL pane.
- `<Snippet language source actions />` — highlighted block with copy/run/explain.
- `<SymbolMap file />` — outline view of a file's symbols.

**Provider / integration views**

These render normalized resources and high-level query results. They should not expose
raw provider query languages to arbitrary generated views by default; see
[Epic 31](./31-composable-project-views.md) for the project-view block/capability model.

- `<WorkItemView id />` — full normalized ticket/work-item card with inline actions.
- `<JiraCommentDraft body />` — draft a comment with preview and "post" affordance.
- `<WorkItemQueryResult query />` — render an approved normalized work-item query result.
- `<GitHubPr num repo />` — full PR detail card.
- `<GitHubIssue num repo />` — full issue card.
- `<GitHubReviewDraft />` — draft a PR review with file annotations.
- `<GitDiff path />` — local working-tree diff.
- `<LogView source streaming />` — streaming log viewer with filters.
- `<Console session />` — terminal/console embed bound to a workflow run.
- `<IntegrationStatus provider />` — provider health/connection state.
- `<PreflightCheck steps />` — multi-step preflight (Epic 23).

**Workflow & agent affordances**

- `<RunMonitor runId />` — live workflow run viewer (steps, logs, outputs).
- `<RecipeLauncher recipeId form />` — interactive recipe launch with input form.
- `<ToolCallView call />` — detail card for a single tool call with replay.
- `<AgentTrace turns />` — agent reasoning trace explorer.
- `<Citation sources />` — sources/references with hover-preview.
- `<Provenance />` — show where each data point originated (per Epic 13).
- `<MemoryViewer scope />` — view/edit relevant memory entries.
- `<ContextMap />` — visualise the typed context surface for the current recipe
  (Epic 21 catalog).
- `<SkillPackBrowser />` — explore installed skill packs.

**Data exploration**

- `<Table rows cols sortable filterable />` — interactive table; sortable/filterable;
  exportable.
- `<Pivot rows cols values />` — pivot table.
- `<Query language="sql|jql|…" editable result />` — editable query with results.
- `<FilterBuilder schema />` — visual filter builder.
- `<Crosstab />` — cross-tabulation.

**Composite & layout**

- `<Tabs />`, `<Accordion />`, `<Split orientation />`, `<Grid />` — layout shells
  that compose other T2 components.
- `<Panel collapsible />`, `<Card />` — visual grouping.
- `<EmptyState />` — typed empty-state placeholder.

### Invocation paths

A chat agent has two ways to land a T2 view on a message. Both end at the same
`t3workExt.view` envelope and the same renderer.

**T2a — registered invocation.** Agent emits a tool call naming a view in the per-
surface catalog with schema-validated props. The view already exists (core,
distribution, pack-provided, project-authored, or composed in a previous turn and
persisted). Renders immediately, no subagent involved. This is the fast path for
the bulk of cases.

**T2b — on-the-fly composition.** Agent emits `compose_view({ purpose, data_refs,
prefer_existing, scope, constraints? })`. A dedicated **composer subagent** spawns,
authors the view in its own context, signals back when ready. The chat agent
continues streaming in the meantime; the message shows a placeholder that swaps
to the rendered view on completion.

The mental model for the chat agent is: _"I want a card showing X"_ — call
`compose_view`, keep talking. No friction, no workspace navigation, no permission
prompts. The composer subagent absorbs the cost of creating something new.

### On-the-fly composition (T2b)

The composer subagent is an `agent.task` step (Phase 4 of the recipes
architecture) wired with a curated tool set for view authoring. It is non-
interactive, never touches the user-facing thread, and surfaces its result via
the step-result binding model.

**Composer subagent tools (curated subset of the broker):**

- `search_existing_views(intent, scope)` — find candidate registered views to
  reuse or extend. Reuse-first is the default behaviour.
- `read_view_source(viewId)` — read an existing view's source for inspiration or
  to diff against.
- `read_context(query)` — inspect the data shapes the view will bind to via
  `Queryable<T>`.
- `list_inline_widgets(surface)` — see which T1 widgets are available to compose
  inside the new view.
- `write_view_module(path, source)` — write a `.tsx` or `.mdx` module to the
  target scope.
- `typecheck(path)` — run the workspace TypeScript check on the new module.
- `preview(viewId, sampleProps)` — render the view with sample props in a
  headless preview and capture errors / screenshots.
- `register_view(spec)` — register the new view under the active recipe's
  catalog (scope-bound) so the chat agent's pending placeholder can resolve.

**Iteration loop.** The composer subagent runs internally:
`reuse-check → draft → typecheck → preview → fix → repeat`. The fix-loop the
user originally floated for chat-agent MDX lives here — at the right layer, on
authoring output, never on chat content.

**Model & reasoning.** The composer runs in its own context with its own model
configuration, independent of the parent thread.

_Reuse existing infrastructure._ t3work already has a workspace-level
"utility model" seam: `textGenerationModelSelection` in
`packages/contracts/src/settings.ts` (defaulting to a Codex provider with
`DEFAULT_GIT_TEXT_GENERATION_MODEL`, currently GPT-5.4 mini), backed by the
per-provider `TextGeneration` driver subsystem (`ClaudeTextGeneration`,
`CursorTextGeneration`, `OpenCodeTextGeneration`) under
`apps/server/src/textGeneration/`. This is the natural pattern to extend, not
duplicate.

The composer adds a sibling setting `composerModelSelection: ModelSelection`
alongside `textGenerationModelSelection`, with **fallback cascading**:

1. **Recipe override** — `defineRecipe({ composer: { model, provider, reasoning, ... } })`.
2. **Pack or distribution policy** — optional defaults or locks from the resolved
   pack graph. Locks win over lower layers; defaults stay user-overridable.
3. **Workspace `composerModelSelection`** setting — if configured by the user.
4. **Workspace `textGenerationModelSelection`** setting — the existing utility-
   model preference. If the user has already picked GPT-5.4 mini for commit
   messages, that signal carries forward.
5. **Per-provider host fallback** (the table below) — only reached when neither
   policy nor setting is configured.

Two independent axes are configurable at each layer:

- **Model tier** — which model handles the iteration loop.
- **Reasoning effort** — how much per-turn thought the model spends (extended
  thinking for Anthropic, `reasoning_effort` for OpenAI, etc.).

_Per-provider host fallbacks (used when policy and settings are unset):_

| Provider                     | Default composer model      | Reasoning effort        | Notes                                       |
| ---------------------------- | --------------------------- | ----------------------- | ------------------------------------------- |
| Anthropic                    | Sonnet 4.x                  | Extended thinking off   | Code-loop tier; one step above Haiku        |
| OpenAI                       | GPT-5.5                     | `reasoning_effort: low` | Capability retained; reasoning is the lever |
| OpenAI (mini-tier preferred) | GPT-5.4 mini                | `reasoning_effort: low` | Honor the established utility-model floor   |
| Cursor                       | Composer 2.5                | n/a                     | Pinned to the purpose-built coding model    |
| Other Codex provider         | provider's text-gen default | provider default        | Conservative; same as text-gen              |

The "OpenAI (mini-tier preferred)" row recognises that the existing
`textGenerationModelSelection` default is already GPT-5.4 mini — so for users
who haven't customised, the composer inherits that choice via cascade step 3.
Power users who want a step-up for tool-loop reliability set
`composerModelSelection` to GPT-5.5 explicitly.

**Why composer ≠ text-gen even though they cascade.** Commit-message
generation is a one-shot prose task; the composer is a multi-turn tool-using
authoring loop. Mini-tier might fail tool-loop discipline where it's fine on
prose. The cascade lets the user opt into separate tuning when needed without
forcing the decision up front; the recipe-level override (`composer.model`)
exists for recipes whose view authoring is genuinely demanding.

_Reasoning policy per loop step (when the model supports the knob):_

- **Iteration loop steps: minimum** (`thinking: off` / `reasoning_effort: low`
  / `minimal`). Concrete error message + small file = no deep reasoning needed.
- **Initial-draft step: `auto`.** If `search_existing_views` finds no close
  match (novel intent), the composer can step up reasoning effort for the
  first draft only. Otherwise inherits the loop default.
- **Override per recipe** when an authoring task is genuinely hard
  (`composer: { reasoning: { onInitialDraft: "high", budget: 4000 } }`).

_Cross-provider composers._ Explicitly supported via cascade step 1 or 2 — a
recipe or workspace can pin a different provider than the parent thread (e.g.,
`composer: { provider: "cursor" }` to use Composer 2.5 even when the parent
chat is on Codex-Anthropic). Cross-provider routing inherits credentials from
the workspace's existing provider config; no separate auth surface, no new
secrets management, no surprise billing.

_Why composer settings are workspace-level, not per-thread._ Matches existing
`textGenerationModelSelection` semantics. The composer is a utility
subsystem, not a thread-bound conversational identity. Per-thread tuning is
available via recipe overrides for recipes that consistently need it, but the
default is "set it once for the workspace, forget about it."

**Storage tiers:**

- **`scope: "thread"`** (default) — module lands in
  `runs/<run-id>/views/<view-id>.tsx`. Lives with the thread; ephemeral but
  inspectable. Disappears when the run directory is pruned.
- **`scope: "project"`** — module lands in the project-local miniapp source location as a
  normal Epic 19 miniapp. Current examples spell this as `.t3work/miniapps/<view-id>/`,
  but Epic 36 treats that path as transitional. The composer subagent must justify this
  scope in its step-result; promoting a thread view later is a one-click affordance in the
  message UI.
- **`scope: "home"`** — user-global, lands in the home workspace's
  `.t3work/miniapps/`. Reserved for views the user explicitly promotes.

**Authoring format.** The composer subagent uses full MDX or `.tsx` per Epic 19. Full MDX (with JSX, hooks, expressions) is available here because the
output goes through the workspace compile pipeline — same trust boundary as
any code. This is _not_ free-typed MDX in a message; it is code committed to
the workspace and rendered through the registered-component path.

**Reuse-first behaviour.** The composer's first action is
`search_existing_views`. If a registered view matches the intent (semantic
similarity over purpose text + signature compatibility), the composer returns
`{ reused: true, viewId, props }` — no new code written. The chat agent's
placeholder resolves with the existing view.

**Failure modes.** Composer subagent has a bounded budget (turns + wall clock).
On exhaustion or hard failure:

- Placeholder swaps to a "view unavailable — see explanation in message"
  affordance.
- Composer returns a structured error with diagnostics; logged for catalog
  gap detection (these errors feed the registered-catalog roadmap).
- Chat agent continues uninterrupted; the response remains valid prose.

### Streaming behaviour

T2 components do not stream by syntax. The `t3workExt.view` payload carries one
of three states; the renderer dispatches accordingly:

- **`ready`** — view ID + validated props. Renders the registered component
  immediately; component may render its own skeletons while loading bound
  `Queryable<T>` data.
- **`composing`** — handle + purpose text + composer step-result subscription.
  Renders an inline placeholder reflecting the composer subagent's progress
  (drafting / typechecking / previewing / fixing). Swaps to `ready` when the
  composer signals completion.
- **`failed`** — error message + diagnostics. Renders inline as a "view
  unavailable" affordance with a one-click "retry" or "explain" action.

The placeholder is itself a small T1 widget (`<ComposingView>`) so it
participates in the same rendering pipeline as any other inline element.

### Versioning

Every T2 component declares `version`. Persisted messages carry the version they
were rendered against. Old renderers stay registered; a coercion step at read
time can upgrade props if a new renderer handles old shapes.

Composer-authored views inherit the same versioning. A thread-scratch view is
pinned to the run directory; if it is later promoted to project scope, the
promotion bumps it to a registered version-1 miniapp and the original message's
`view.id` reference is rewritten to point at the promoted module.

## T3: Persistent artifact

Already specified in Epic 08. `RichArtifact.format = "mdx"` artifacts gain the same T1
inline component whitelist plus T2 components rendered as `artifact.detail`
placement. The same registry serves both message MDX and artifact MDX, scoped by
surface.

## Discovery contract

The agent never sees the full component registry. It sees a **per-surface catalog**
shaped by:

- the active recipe's `allowedComponentGroups` (mirrors `allowedToolGroups` from Epic 16),
- the active skill pack profile (Epic 12),
- the surface placement (conversation card vs sidecar vs artifact detail).

Catalog entries are slim:

```ts
type ComponentCatalogEntry = {
  name: string;
  tier: "T1" | "T2";
  purpose: string; // one-line
  example: string; // one tight example of MDX or tool-call shape
  propsSchemaRef: string; // pointer; full schema fetched lazily via describe_widget tool
};
```

The full catalog ships to the agent at turn start as a compact table (≤2 lines per
entry, ~100 tokens for 40 components). Full props schemas load on demand via a
`describe_widget(name)` tool call only when the agent commits to using a complex one.

This matches the existing pattern from Epic 16's agent-discovery contract (generated
`.d.ts` + `context.schema.json` + `context-map.md`).

## SDK shape

Two new typed helpers, peers to the existing `define*` family in Epic 19:

- `defineInlineWidget` — registers a T1 component with `name`, `propsSchema`,
  `fallback` text generator, `surfaces`, `render`.
- `defineConversationCard` (already planned in Epic 19) — registers a T2 component
  for `conversation.inlineCard` placement.

Existing helpers (`defineArtifactRenderer`, `defineConversationSidecar`, etc.) cover
the rest of the T2 surfaces without change.

The on-the-fly composer is a host capability rather than a `define*` helper — the
`compose_view` tool is contributed by the t3work runtime and gated by the active
recipe's `allowedComponentGroups` plus any pack/distribution policy locks. A
recipe can optionally narrow composer behaviour via
`defineRecipe({ composer: { … } })`:

```ts
defineRecipe({
  // ...
  composer: {
    defaultScope: "thread", // "thread" | "project" | "home"
    maxIterations: 6, // fix-loop budget
    maxWallClockMs: 120_000,
    allowedAuthoringFormats: ["tsx", "mdx"],
    model: "auto", // "auto" -> resolved policy or host fallback
    provider: "inherit", // "inherit" | explicit provider id
    reasoning: {
      onInitialDraft: "auto", // "minimal" | "low" | "medium" | "high" | "auto"
      onFixIteration: "minimal", // recommended minimal; loop turns are narrow
      budget: 4000, // tokens (Anthropic extended thinking); ignored when provider uses level-based reasoning
    },
    allowedTools: undefined, // undefined = curated default set
  },
});
```

All fields are optional; the runtime defaults are sensible. `model: "auto"`
resolves through the **settings cascade** (recipe -> pack/distribution policy ->
`composerModelSelection` workspace setting -> `textGenerationModelSelection`
workspace setting -> host fallback). `reasoning` level names map to each provider's
native knob — Anthropic's extended-thinking budget (driven by `budget`),
OpenAI's `reasoning_effort` parameter (`minimal` | `low` | `medium` | `high`),
and provider-specific equivalents elsewhere.

A component may export _both_ an inline widget and a view from the same module to
share rendering code:

```ts
// project-recipes/components/ticket-ref.ts
export const inline = defineInlineWidget({
  name: "TicketRef",
  propsSchema: z.object({ id: z.string() }),
  fallback: ({ id }) => `Ticket ${id}`,
  surfaces: ["message.content", "artifact.mdx"],
  render: TicketRefInline,
});
```

## Renderer architecture

```
Message
  └─ content (markdown or MDX)        ← T1 inline widgets
  └─ t3workExt.displayText?           ← user-facing text when provider text includes hidden context
  └─ t3workExt.view?                  ← T2 view (one)
  └─ t3workExt.attachments?           ← context attachments (existing)
```

The web app dispatches at the message-renderer level:

- Default upstream behaviour: `ChatMarkdown.tsx` with `react-markdown` (unchanged).
- When `t3workExt.displayText` is set: render it as the conversation body instead of
  `message.text`. `message.text` remains the provider-facing serialization and may include
  injected context, paths, or other agent-only framing. The renderer must not parse provider
  text to recover attachment cards.
- When `t3workExt.mdx === true` or any T1 widget is detected: route to
  `t3work-MdxChatRenderer.tsx` (new, additive) using `safe-mdx` with the resolved
  per-surface component map.
- When `t3workExt.attachments` is set: render attachment cards from that structured payload.
  Context-bound sends and kickoff messages must store cards here; text syntax is only for the
  provider-facing prompt.
- When `t3workExt.view` is set: render the T2 view in addition to (or instead of) the
  message body, per the view's `placement` (`conversation.inlineCard` is rendered
  beneath the message; `conversation.sidecar` opens the right panel).

The dispatch decision lives in `MessagesTimeline.tsx` (already in the additive
whitelist).

## Sandbox & security

- **Stage 1 (today):** T1 + T2 components are project-trusted code. The model can
  only invoke registered names; arbitrary JSX is rejected by `safe-mdx`'s whitelist.
- **Stage 2 (future, parallel track per recipes architecture):** components marked
  `requiresStage2: true` (R3F, `ARView`, `Camera`, `Lab`, `Embed`-style iframes) run
  in a sandboxed renderer with no ambient FS/network/React; everything routes through
  `api.*`. Components not so marked remain stage-1.

Inline T1 widgets are always stage-1 — they cannot run arbitrary code by construction.

## Accessibility, search, copy-paste

Every T1 widget exports a `fallback(props): string` used for:

- the `aria-label` attribute on the rendered element,
- the indexable representation in message search,
- the plain-text serialization when the user copies the message to Slack/email.

T2 views must export an `inlineFallback(props): string` used the same way when the
view appears in a context that cannot render React (e.g. exported PDF of a thread).

## Performance

- Chat list virtualisation (existing) caps active components per viewport.
- T2 views are `IntersectionObserver`-guarded: heavy components (R3F, video, live
  log streams) unmount on scroll-out and remount on scroll-in.
- "Still-image-first, hydrate-on-click" pattern available via `defineConversationCard`'s
  `preview` field for the heaviest components.

## Persistence & replay

- T1 MDX persists as message text → trivial replay.
- T2 view props are snapshot at write time into the `t3workExt.view.props` payload —
  the renderer reads context only if the props say so (e.g.
  `<RunMonitor runId="…" mode="live" />` re-resolves; `mode="snapshot"` reads from
  persisted state). Choice is per-component and per-instance.
- T3 artifacts already persisted via Epic 08.

## Comparison to AG-UI / A2UI / MCP-UI / Vercel streamUI

- **AG-UI** is a runtime channel for cross-framework agent↔frontend interop. `t3work`
  runs agents in-process via the Codex Session Runtime and already has the equivalent
  bidirectional channel via `T3workToolBroker` + `t3workExt`. AG-UI becomes
  interesting only if `t3work` exposes its agents to external frontends, at which
  point the same T1/T2/T3 payloads carry over its events.
- **A2UI** describes UI as declarative data. T2 views via `t3workExt.view` already
  carry "UI as data" (the view name + props schema-validated). A2UI could become the
  on-the-wire schema for T2 if we want interop; the in-process shape is unaffected.
- **MCP-UI** serves pre-built HTML in sandboxed iframes via `ui://` URIs. Suitable
  for _external_ tool surfaces that bring their own UI; not the right model for our
  first-party components which want React + shared design system + context bindings.
  MCP-UI could plug in as a fallback renderer for third-party MCP tools that bring
  their own UI.
- **Vercel `streamUI`** — closest analogue to T2b on-the-fly composition. `streamUI`
  has the model emit a component instance from a tool call in one LLM pass; our
  composer subagent has more headroom — its own context, an iterative
  draft→typecheck→preview→fix loop, reuse-first behaviour against a registered
  catalog, and durable workspace output. The trade-off is latency: `streamUI` is
  one model call; T2b is a subagent that takes seconds. The placeholder + async-
  resolve pattern absorbs that latency without blocking the chat.

## Additive guard impact

- **New files (all additive):**
  - `apps/web/src/t3work/t3work-MdxChatRenderer.tsx`
  - `apps/web/src/t3work/t3work-inlineWidgetRegistry.ts`
  - `apps/web/src/t3work/widgets/t3work-*.tsx` (one per inline widget)
  - `packages/project-recipes/src/defineInlineWidget.ts`
  - `apps/server/src/composer/*.ts` (Phase D — composer subagent, mirrors the
    existing `apps/server/src/textGeneration/` layout for the per-provider
    driver pattern)
- **Modified upstream files (T1, Phases A–B):**
  - `MessagesTimeline.tsx` — already in the whitelist; the existing reason
    ("Parse and render context attachment chips from user message text") arguably
    covers the renderer-dispatch addition. If the reviewer disagrees, the entry
    extends with: "Dispatch to t3work MDX renderer when `t3workExt.mdx === true`."
  - **No edits to `ChatMarkdown.tsx`.** The new renderer is an alternative, selected
    upstream of the existing one.
- **Modified upstream files (T2b composer, Phase D):**
  - `packages/contracts/src/settings.ts` — already in the whitelist for
    t3work-prefixed client settings; this addition (`composerModelSelection:
ModelSelection`) is an upstream-style sibling to the existing
    `textGenerationModelSelection`, following the same shape. One new whitelist
    entry with the rationale: "Add upstreamable `composerModelSelection` next to
    `textGenerationModelSelection` for the view-composer subagent; same shape,
    same per-provider driver pattern, designed to be upstreamable."
  - Per-provider composer drivers under `apps/server/src/composer/` mirror the
    text-generation driver layout (`ClaudeComposer`, `CursorComposer`,
    `OpenCodeComposer`) and are entirely additive.

Net new whitelist entries: 1–2 across both tracks. Still meaningfully cheaper
than embedding MDX support into upstream `ChatMarkdown.tsx`, and the composer
settings entry is structured to be upstreamable should pingdotgg adopt the
composer pattern.

## Phasing slice

Smallest credible end-to-end slice that proves the model:

**Phase A — Skeleton + 3 widgets** (≈1 sprint, ~1 day of model time)

1. Add `defineInlineWidget` SDK helper in `packages/project-recipes/src/`.
2. Add `t3work-MdxChatRenderer.tsx` using `safe-mdx` with whitelist enforcement and
   fallback-on-failure semantics.
3. Add three T1 widgets: `<Callout>`, `<Badge>`, `<Sparkline>`.
4. Wire dispatch in `MessagesTimeline.tsx` behind `t3workExt.mdx === true`.
5. One recipe (existing) gets a prompt-extension snippet that lists the three
   widgets with one example each.
6. Acceptance: an agent in that recipe demonstrably emits a `<Callout>` mid-response
   and it renders; a malformed `<Sparkline>` falls back to text without breaking
   the message.

**Phase B — Catalog expansion + discovery contract** (≈1 sprint)

7. Add the full T1 ref family (`TicketRef`, `ThreadRef`, `ArtifactRef`, etc.) plus
   inline structures (`KeyValueList`, `MiniTable`, `Checklist`, `Steps`).
8. Per-surface catalog generation pipeline (mirrors Epic 16's `.d.ts` + context
   schema pipeline).
9. Profile + recipe scoping of `allowedComponentGroups`.
10. Lazy-loading machinery for T1 (`loading: "lazy"`); ship `<Mermaid>` and `<Math>`
    as the first lazy widgets, with `<Dot>` as a follow-up once the pattern proves
    out.

**Phase C — T2 view consolidation** (≈2 sprints; overlaps Epic 19 Phase 5)

11. Land `defineConversationCard` properly (currently sketched in Epic 19).
12. Migrate existing Epic 08 block kinds (`text`, `callout`, `table`, `checklist`,
    `test matrix`, `risk list`, `timeline`, `status board`, `form`,
    `mutation preview`, `link list`, `attachment grid`) into T2 components.
13. Ship `<Chart>`, `<Diff>`, `<Form>`, `<JiraIssueView>`, `<GitHubPr>`,
    `<RecipeLauncher>` as the first cross-cutting T2 set.

**Phase D — On-the-fly composition (T2b)** (≈2 sprints; depends on recipes Phase 4
`agent.task` step)

14. Settings + driver scaffolding — add `composerModelSelection: ModelSelection`
    in `packages/contracts/src/settings.ts` next to `textGenerationModelSelection`;
    add `apps/server/src/composer/` with per-provider drivers
    (`ClaudeComposer`, `CursorComposer`, `OpenCodeComposer`) mirroring the
    `textGeneration/` layout; wire the cascade resolver
    (recipe -> pack policy -> composer setting -> text-gen setting -> host fallback).
15. Composer subagent skeleton — `compose_view` tool, `agent.task` invocation,
    bounded budget, step-result subscription wiring.
16. Composer tool surface — `search_existing_views`, `read_view_source`,
    `read_context`, `list_inline_widgets`, `write_view_module`, `typecheck`,
    `preview`, `register_view`.
17. Streaming placeholder rendering — `<ComposingView>` T1 widget reflects
    composer progress and swaps to the registered view on completion.
18. Storage tiers — `runs/<run-id>/views/` for thread scope; promotion flow to the
    project-local miniapp source location for project scope; UI for "promote to project"
    on a composed view.
19. Settings UI — add a "Composer model" row to the existing settings panel
    next to "Text generation model", linking the cascade transparently
    ("inherits from Text generation model when unset").
20. Acceptance: agent in a real recipe emits `compose_view`, the composer
    subagent writes a working view module, message placeholder swaps to the
    rendered card without blocking the chat turn. User can override the
    composer model from the same settings panel that already configures
    text-generation.

**Phase E — Heavy / fancy expressivity** (later; depends on stage-2 sandbox)

21. R3F components (`ThreeScene`, `Model3D`, `Plot3D`).
22. Remotion-rendered `<Reel>` (offline-rendered MP4 to keep chat perf sane).
23. Interactive diagram family (`<Flowchart>`, `<Sequence>`, `<Gantt>`, `<Network>`,
    `<DependencyGraph>`, `<StateMachine>`). Static Mermaid/DOT/Math ship earlier as
    lazy-loaded T1 widgets.
24. `Lab` / `Notebook` / `REPL` interactive code surfaces.

Phases A–B sit alongside the existing 6-phase plan (per the recipes architecture
memory). Phase C folds into Epic 19 Phase 5. Phase D blocks on recipes Phase 4
(`agent.task`). Phase E folds into the parallel stage-2 sandbox track.

## Working Decisions

1. T1 widgets are display/link primitives. They may navigate to an existing route, but they
   do not launch workflows. Workflow-triggering UI belongs in T2 views, recipe launchers,
   or explicit action components.
2. Per-project custom T1 widgets are out of v1. Use T2 miniapps/views for trusted
   project-specific UI; revisit custom T1 only in the later sandbox/marketplace track.
3. ~~**MDX vs MDX-lite.**~~ **Resolved.** Two-shape model:
   - **T1 in messages: MDX-lite via `safe-mdx`** — markdown + tag invocations with
     literal props. No imports, no JS expressions. The model-emitted MDX in
     `Message.content` cannot reference runtime values or execute code.
   - **T2 authoring: full MDX** — T2 components (and T3 artifacts) may be authored
     as full MDX modules with JSX, expressions, hooks, and state, compiled at
     workspace build time. This is the same trust boundary as any code in the
     workspace.
   - **T2 runtime invocation stays structured.** The agent does not free-type full
     MDX into a message at runtime — it emits a `t3workExt.view` tool call with a
     view name and schema-validated props. The view (which may have been authored
     in full MDX) renders those props. This preserves stage-1 trust without giving
     up authoring expressivity.
4. **Search projection.** T1 widget `fallback` text is used for in-thread search;
   does it also feed the broader project context index? Probably yes, but the seam
   to do so cleanly is undefined.
5. **`describe_widget` tool surface.** Sketched above as a dynamic tool; could
   alternatively be inlined as JSON-schema in the catalog at the cost of more
   tokens up-front. Trade-off worth measuring once the catalog grows past ~50
   entries.
6. **Naming.** "Inline widget" / "view" / "artifact" works internally; product-
   facing copy will land in Epic 19 / 08 once this proposal is accepted.
7. **Composer governance.** What can a composer-authored view import or call? Open
   options: (a) restrict to a curated component library + `Queryable<T>` + the
   active recipe's tool broker subset; (b) allow any in-workspace import the
   workspace already exposes; (c) gate MCP tool access from composed views behind
   an explicit "this view will call MCP X" affordance shown to the user. (a) is the
   safest default; (c) is the right add-on once external MCP usage matters. Also
   open: should a thread-scope composed view auto-run on every replay of the
   thread, or require a user click on resurrection?
8. **Reuse-detection quality.** The composer's `search_existing_views` does semantic
   similarity over purpose text plus signature compatibility. How fuzzy is too
   fuzzy? Cheap-but-blunt: exact-keyword match. Expensive-but-precise: embedding
   similarity over purpose + props shape. The risk of over-reuse is misfit views
   (composer wedges a Chart into a Form-shaped need); the risk of under-reuse is
   catalog explosion. Worth instrumenting reuse rate in Phase D and tuning.
9. **Composer budget signalling.** When the composer subagent gives up, the
   chat agent should know — but how? Options: composer returns a structured
   error the chat agent sees on its next turn; or the failure shows only in the
   message UI and the chat agent moves on without awareness. The first is more
   honest but pulls failure into the chat agent's context; the second keeps the
   chat lean at the cost of opacity.

## References

- [Epic 08 — Rich Artifacts](./08-rich-artifacts.md) — T3 substrate (MDX as artifact format).
- [Epic 16 — Action Recipes](./16-action-recipes.md) — workflows, tool broker,
  message envelope, `t3workExt` seam.
- [Epic 19 — Workspace Miniapps](./19-workspace-miniapps.md) — T2 substrate
  (miniapps + `define*` SDK).
- [Epic 13 — Resource References](./13-resource-references.md) — `ResourceRef`
  shape reused for T1 ref widgets.
- [Epic 21 — Context & Tool Catalog](./21-context-tool-catalog.md) — discovery
  contract pattern reused for component catalog.
