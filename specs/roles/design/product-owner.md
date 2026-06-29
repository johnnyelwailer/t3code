# Role Design Spec: Product Owner (`product-owner`)

> Draft for iteration. Pairs with the implementation-status mapping in
> [../product-owner.md](../product-owner.md). **This is the system default profile**
> (`DEFAULT_T3WORK_PROFILE_ID`), so its defaults set the first impression for new users.

## 1. Who this is for

Product Owners and Proxy POs who own the backlog: they prioritize, frame value for
stakeholders, refine items into ready work, and make scope trade-offs. They think in
outcomes and user impact, not implementation.

## 2. Recommended configuration

| Field | Recommended value | Rationale |
| --- | --- | --- |
| `audience` | `product` | *(matches code)* |
| `communicationStyle.technicalDepth` | `low` | PO reasons in user/value terms. *(matches code)* |
| `communicationStyle.brevity` | `short` | POs scan many items; lead with the decision. *(matches code)* |
| `communicationStyle.guidanceStyle` | `guided` | As the default profile, hold a new user's hand. *(matches code)* |
| `surfaceDefaults.detailDensity` | `guided` | *(matches code)* |
| `surfaceDefaults.activityOrder` | `newest-first` | *(matches code)* |
| `surfaceDefaults.collapseLowSignalEvents` | `true` | *(matches code)* |
| `hideImplementationComplexity` | `true` | *(matches code)* |
| `tags` | `product`, `backlog`, `prioritization` | *(matches code)* |
| `preferredArtifactKinds` | `summary`, `decision-notes`, `open-questions`, `status-update` | *(matches code)* |
| `defaultActionFamilies` | `product`, `delivery`, `summary` | *(matches code)* |
| `recommendedSkillPackIds` | `product`, `delivery` | Product framing + delivery coordination. *(matches code)* |

**`defaultRecipeWeights` (existing recipes only):**

| Recipe | Weight | Note |
| --- | --- | --- |
| `stakeholder-update` | 30 | Outward-facing staple. *(matches code)* |
| `explain-selected-work` | 25 | *(matches code)* |
| `review-acceptance-criteria` | 20 | Refinement readiness check. *(matches code)* |
| `shape-next-backlog-slice` | 20 | Backlog refinement. *(proposed addition)* |
| `summarize-project-risk` | 10 | *(matches code)* |
| `tshirt-size-epic` | 10 | Coarse sizing before decomposition. *(proposed addition)* |

> The two *(proposed addition)* rows reference recipes that **already exist**, so they are
> safe to add to the shipped profile and are included in §8.

## 3. Tone & communication

- **Outcome-first.** Lead with user/business impact and the decision being asked for.
- **Low jargon.** Translate engineering/QA detail into plain stakeholder language.
- **Make the trade-off explicit.** When prioritizing or re-scoping, name what wins, what
  waits, and why — POs decide, the assistant frames the choice.
- **Short by default, expandable on demand.** A 3-bullet summary beats a wall of text.
- Resolve framing yourself where reasonable — the PO's time is the scarce resource.

## 4. Recipes that fit

### Available today

- **`stakeholder-update`** — low-jargon status for stakeholders/customers. Emits
  `status-update`, `decision-notes`.
- **`explain-selected-work`** — plain-language summary + open questions.
- **`review-acceptance-criteria`** — readiness check before pulling into a sprint.
- **`shape-next-backlog-slice`** — pick the next 1–3 items and justify it. Emits
  `priority-list`, `decision-notes`.
- **`prioritize-pending-work`** — now/next/later ranking of the visible view.
- **`tshirt-size-epic`** — XS–XL sizing with confidence and risk drivers; suggests
  `shape-next-backlog-slice` to decompose. Emits `estimation-notes`, `open-questions`.
- **`re-scope-ticket-overrun`** — split / defer / finish on overrun items.
- **`summarize-project-risk`** — blockers, unclear work, next actions.

### Proposed (not yet authored)

| Suggested id | Intent | Suggested artifacts | Suggested pack |
| --- | --- | --- | --- |
| `refine-backlog-item` | Take a rough item to "ready": summary, value statement, AC stub, open questions. | `summary`, `acceptance-criteria`, `open-questions` | `product` |
| `draft-user-story` | Well-formed user story (As a… I want… so that…) with INVEST check. | `requirement-spec` | `product` |
| `value-vs-effort-ranking` | Rank items on a value/effort grid with a recommended cut line. | `priority-list`, `decision-notes` | `product` |

## 5. Workflows that fit

### Workflow: Backlog refinement pass

1. `tool` — read the visible backlog slice.
2. `agent` — `shape-next-backlog-slice`: pick the next 1–3 items.
3. `agent` — `refine-backlog-item` (per item): tighten summary + value + AC stub.
4. `agent` — `review-acceptance-criteria`: flag what still blocks readiness.
5. `present-message` — refined items + remaining `open-questions`.

### Workflow: Stakeholder update pack

1. `tool` — read project summary + risk hotspots.
2. `agent` — `summarize-project-risk`: internal risk picture.
3. `agent` — `stakeholder-update`: translate into a low-jargon update.
4. `present-message` — `status-update` draft ready to send.

## 6. Skill packs & supporting assets

- **Recommended packs (today):** `product`, `delivery`.
- **Proposed pack additions:** add `refine-backlog-item`, `draft-user-story`,
  `value-vs-effort-ranking` to the `product` pack.
- **Prompt blocks (proposed):** `product.value-framing` (benefit-first phrasing),
  `product.invest-check` (story-quality checklist).
- **Artifact templates needed:** `decision-notes` and `summary` exist via current recipes;
  `priority-list` is emitted by existing recipes; `requirement-spec` would be new.
- **Allowed tool groups:** default `integration.read`, `artifact.rw`, `ui.render`, plus
  `view.state` so backlog-shaping recipes can apply filters inline.

## 7. Surface, safety & follow-ups

- **Sidecar sections:** default composition (`quick-starts`, `recent-conversations`) suits
  the guided default profile. Aspirational: a `backlog-health` section.
- **Mutation safety posture:** **guided-safe.** As the default profile, default to
  preview-then-approve for any Jira write; never auto-mutate backlog state.
- **Follow-up suggestions:** after `tshirt-size-epic`, suggest `shape-next-backlog-slice`
  (already wired as a `suggestedAction` on that recipe); after `shape-next-backlog-slice`,
  suggest `review-acceptance-criteria`.
- **Default language:** unset; inherit workspace default.

## 8. Recommended profile definition (code)

```ts
"product-owner": {
  id: "product-owner",
  title: "Product Owner",
  description:
    "Backlog refinement, prioritization rationale, and stakeholder-ready value framing.",
  audience: "product",
  tags: ["product", "backlog", "prioritization"],
  communicationStyle: { technicalDepth: "low", brevity: "short", guidanceStyle: "guided" },
  surfaceDefaults: {
    detailDensity: "guided",
    activityOrder: "newest-first",
    collapseLowSignalEvents: true,
  },
  preferredArtifactKinds: ["summary", "decision-notes", "open-questions", "status-update"],
  defaultActionFamilies: ["product", "delivery", "summary"],
  defaultRecipeWeights: {
    "stakeholder-update": 30,
    "explain-selected-work": 25,
    "review-acceptance-criteria": 20,
    "shape-next-backlog-slice": 20,
    "summarize-project-risk": 10,
    "tshirt-size-epic": 10,
  },
  recommendedSkillPackIds: ["product", "delivery"],
  hideImplementationComplexity: true,
},
```

## 9. Notes for iteration

- As the **default profile**, keep its first-run surface uncluttered — a few
  high-confidence recipes beat breadth.
- `shape-next-backlog-slice` and `prioritize-pending-work` overlap; decide which leads on
  the backlog dashboard.
- Decide if `draft-user-story` belongs here or with the Requirements Engineer.
