---
name: change-request-assessment
description: "Requirements Engineer workflow to validate a customer change request (CR) and produce a reviewable assessment. Use when a customer/stakeholder sends in a change request and someone asks: what components does this change touch, how complex is it, how many hours of spec/story (Requirements-Engineering) effort, and how many developer hours. Triggers: 'validate this change request', 'assess this CR', 'estimate this change', 'what components does this change affect', 'complexity + hours estimate', 'story-spec effort vs dev effort'. Produces a CR assessment artifact under specs/change-requests/."
---

# Change Request Assessment (Requirements Engineer)

Validate an incoming customer **change request (CR)** and produce a single reviewable
assessment that answers four questions:

1. **Components** — which packages/modules/contracts the change would alter (new vs. modified).
2. **Complexity** — a rated band (`Trivial`→`Very High`) with the drivers behind it.
3. **Story-spec effort** — rough hours to *specify* the change (RE/PO work: spec + acceptance
   criteria + story breakdown + review cycles). **Not** implementation.
4. **Developer effort** — rough hours to *build* it (implementation + tests + Storybook +
   review/rework), grounded in this repo's actual constraints.

This is a **requirements-validation and estimation** workflow, not an implementation task.
You do not write production code here. You read the codebase to ground the estimate, then
emit an assessment artifact.

The role this serves: [Requirements Engineer](../../../specs/roles/requirements-engineer.md).

---

## When to stop and ask first

A CR you cannot scope is a CR you cannot estimate. Before estimating, the RE's first job is
to surface ambiguity. If any of these is true, **do not fabricate an estimate** — list the
open questions and ask the user to resolve the blocking ones, then continue:

- The core change cannot be stated in one sentence.
- A requirement is genuinely undecidable (you'd be guessing at behavior, not detail).
- The CR implies a contract/schema or data-migration change but doesn't say so.
- Scope could plausibly differ by >3× depending on one unanswered question.

A *low-confidence* estimate with stated assumptions is fine and expected. A *blind* estimate
is not.

---

## Workflow

### 1. Capture the change request

- Record the CR source and raw text verbatim in the artifact (link or paste).
- State the **core change in one sentence**.
- Extract requirements as a list, splitting **explicit** (stated) from **implicit**
  (necessarily entailed). Number them — they become the traceability anchor for components
  and effort.
- List **ambiguities / open questions**. Mark each `blocking` or `non-blocking`.

### 2. Map to components

Do not estimate from the prose alone — find the real code. Ground every affected-component
claim in the repo.

- Start from the **Package Roles** in [AGENTS.md](../../../AGENTS.md):
  - `apps/server` — Node WS server, provider sessions, Codex app-server wrapper.
  - `apps/web` — React/Vite UI, session UX, event rendering, client state.
  - `packages/contracts` — shared effect/Schema schemas & TS contracts (schema-only).
  - `packages/shared` — shared runtime utilities (subpath exports, no barrel).
  - `packages/client-runtime` — shared client code across web & mobile.
  - `apps/desktop` / mobile surfaces where relevant.
- Use `Grep`/`Glob` to locate the concrete files, modules, components, and **contracts** each
  requirement touches. Prefer naming real files over vague layers.
- For each affected component, classify the change as:
  - **New (additive)** — net-new file/module/surface, or
  - **Modify existing** — edits to shipped code.
- Flag the high-cost signals explicitly, because they dominate effort:
  - **Contract/schema change** in `packages/contracts` (ripples to server + all clients).
  - **Cross-package coordination** (server *and* web *and* contracts in one change).
  - **Data migration / persisted-state shape change** (SQLite projection, snapshots).
  - **t3work additive constraint** — `t3work-*` prefixed files are capped at 200 non-empty
    lines (see [AGENTS.md](../../../AGENTS.md)); a change that needs a large stateful unit is
    really several small modules, which raises the realistic dev hours.

Output a **component table**: component · new/modify · what changes · requirement #s · risk.

### 3. Rate complexity

Pick one band using the rubric. Quote the **drivers** (which rows pushed it up). When signals
straddle two bands, choose the higher and say why.

| Band | Typical shape |
| --- | --- |
| **Trivial** | 1 component, additive, no contract change, no UI state, no new tests of note. |
| **Low** | 1–2 components, mostly additive, isolated, no schema change. |
| **Medium** | 2–3 components, possibly one contract change, some cross-layer wiring, real test/Storybook burden. |
| **High** | 3+ components, contract change(s), cross-package coordination, non-trivial failure/edge surface. |
| **Very High** | Many components, schema/data migration, new package or surface, broad reconnect/streaming/state impact. |

Complexity drivers to weigh: # components, contract changes, cross-package fan-out, data
migration, failure/edge-case surface (reconnect, partial streams, restarts — a core priority
per AGENTS.md), test + Storybook + snapshot coverage burden, and unknowns/ambiguity left.

### 4. Estimate effort (two separate numbers, each a range)

Estimates are in **story points (SP)**, where **1 SP = 8 hours**. Always give the SP **and**
the derived hours (SP × 8). Give **ranges, not false precision**, and a **confidence**
(`High`/`Medium`/`Low`). State the assumptions the range rests on. Keep the two efforts
strictly separate.

- **Story-spec effort (RE/PO):** writing the spec from [TEMPLATE.md](../../../specs/TEMPLATE.md),
  acceptance criteria, story/task breakdown, and review iterations. Scales with *ambiguity and
  stakeholder coordination*, not code size — a small but underspecified CR can be spec-heavy.
- **Developer effort:** implementation + tests (this repo targets 90–100% coverage on
  high-value paths) + Storybook/snapshots for reusable UI + browser click-through validation +
  code review and rework. The ≤200-line module discipline and additive isolation are real
  costs — count them.

Use a Fibonacci-style SP scale (0.5, 1, 2, 3, 5, 8, 13, 21). Default reference bands
(**tunable** — adjust to team velocity; say so if you do):

| Complexity | Story-spec SP (RE/PO) | Developer SP (impl+tests+stories+review) |
| --- | --- | --- |
| Trivial | 0.5 _(4 h)_ | 0.5–1 _(4–8 h)_ |
| Low | 0.5–1 _(4–8 h)_ | 1–2 _(8–16 h)_ |
| Medium | 1 _(8 h)_ | 2–3 _(16–24 h)_ |
| High | 1–2 _(8–16 h)_ | 3–8 _(24–64 h)_ |
| Very High | 2–3+ _(16–24+ h)_ | 8–21+ _(64–168+ h)_ |

Start from the band, then nudge within/across it for the specific drivers (e.g. a Medium CR
that also needs a contract change + migration leans toward the High dev band). Snap to the
nearest scale point rather than inventing fine-grained values. Always show the reasoning, not
just the number.

### 5. Risks, dependencies, recommendation

- **Risks & unknowns** — what could blow the estimate up, and the assumption each rests on.
- **Dependencies** — other CRs/specs, external systems (Jira/Atlassian, providers), approvals.
- **Recommendation** — proceed to spec / split into smaller CRs / needs clarification first /
  reject-as-scoped. One line, justified.

### 6. Emit the artifact

- Create `specs/change-requests/CR-NNNN-short-slug/assessment.md` (next free zero-padded id;
  create the `specs/change-requests/` folder and a `README.md` index on first use, mirroring
  [specs/README.md](../../../specs/README.md) conventions).
- Fill in [assessment-template.md](./assessment-template.md).
- Add an index row (id · title · complexity · spec hrs · dev hrs · status).
- Set today's date (see the `currentDate` in project context; don't invent dates).
- Summarize the four answers back to the user inline, with the artifact path.

---

## Guardrails

- **Estimate, don't implement.** No production code in this workflow.
- **Ground component claims in real files** — grep, don't guess.
- **Ranges with confidence**, never a single false-precise number.
- **Two efforts stay separate** — Story-spec (RE/PO) and Developer hours are different lines.
- **Surface ambiguity before estimating** — that's the RE's job; flag blocking questions.
- The numbers are a *rough* decision aid for go/no-go and planning, not a quote.
