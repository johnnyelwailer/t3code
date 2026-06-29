export function renderChangeRequestAssessmentSkill(): string {
  return `---
name: change-request-assessment
description: "Validate a customer/stakeholder change request (CR) and produce a reviewable assessment: which parts of the codebase it touches, how complex it is, the requirements/spec effort, and the developer effort. Use when someone asks to validate, assess, size, or estimate a change request, or asks what components a change affects and how many hours of spec vs. dev work it implies. Produces a CR assessment artifact under specs/change-requests/."
---

# Change Request Assessment

Validate an incoming **change request (CR)** and produce a single reviewable assessment
that answers four questions:

1. **Components** — which parts of this codebase the change would alter (new vs. modified).
2. **Complexity** — a rated band (Trivial -> Very High) with the drivers behind it.
3. **Story-spec effort** — rough effort to *specify* the change (requirements/PO work: spec +
   acceptance criteria + story breakdown + review cycles). **Not** implementation.
4. **Developer effort** — rough effort to *build* it (implementation + tests + review/rework),
   grounded in this project's actual constraints.

This is a **requirements-validation and estimation** workflow, not an implementation task.
You do not write production code here. You read the codebase to ground the estimate, then
emit an assessment artifact.

---

## When to stop and ask first

A CR you cannot scope is a CR you cannot estimate. Before estimating, your first job is to
surface ambiguity. If any of these is true, **do not fabricate an estimate** — list the open
questions and ask the user to resolve the blocking ones, then continue:

- The core change cannot be stated in one sentence.
- A requirement is genuinely undecidable (you'd be guessing at behavior, not detail).
- The CR implies a contract/schema or data-migration change but doesn't say so.
- Scope could plausibly differ by >3x depending on one unanswered question.

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
- List **ambiguities / open questions**. Mark each blocking or non-blocking.

### 2. Map to components

Do not estimate from the prose alone — find the real code. Ground every affected-component
claim in the repo.

- Start from this project's own structure and conventions. If the repo ships an AGENTS.md,
  CLAUDE.md, README, or architecture doc, read it first to learn the module/package layout
  and ownership; otherwise infer the layout from the directory tree.
- Use Grep/Glob to locate the concrete files, modules, components, and **contracts/schemas**
  each requirement touches. Prefer naming real files over vague layers.
- For each affected component, classify the change as **New (additive)** — a net-new
  file/module/surface — or **Modify existing** — edits to shipped code.
- Flag the high-cost signals explicitly, because they dominate effort:
  - **Shared contract / schema / API change** (ripples to every consumer).
  - **Cross-package or cross-layer coordination** (e.g. server *and* UI *and* shared
    contracts in one change).
  - **Data migration / persisted-state shape change.**
  - **Failure / edge-case surface** — reconnect, partial state, retries, restarts.
  - **Project-specific structural constraints** (module-size limits, isolation rules) that
    force one logical change into several smaller units, raising realistic dev effort.

Output a **component table**: component · new/modify · what changes · requirement #s · risk.

### 3. Rate complexity

Pick one band using the rubric. Quote the **drivers** (which rows pushed it up). When signals
straddle two bands, choose the higher and say why.

| Band | Typical shape |
| --- | --- |
| **Trivial** | 1 component, additive, no contract change, no UI state, no new tests of note. |
| **Low** | 1-2 components, mostly additive, isolated, no schema change. |
| **Medium** | 2-3 components, possibly one contract change, some cross-layer wiring, real test burden. |
| **High** | 3+ components, contract change(s), cross-package coordination, non-trivial failure/edge surface. |
| **Very High** | Many components, schema/data migration, new package or surface, broad reconnect/streaming/state impact. |

Complexity drivers to weigh: number of components, contract changes, cross-package fan-out,
data migration, failure/edge-case surface, test/coverage burden, and unknowns/ambiguity left.

### 4. Estimate effort (two separate numbers, each a range)

Estimates are in **story points (SP)**, where **1 SP = 8 hours**. Always give the SP **and**
the derived hours (SP x 8). Give **ranges, not false precision**, and a **confidence**
(High/Medium/Low). State the assumptions the range rests on. Keep the two efforts strictly
separate.

- **Story-spec effort (requirements/PO):** writing the spec from your team's spec template,
  acceptance criteria, story/task breakdown, and review iterations. Scales with *ambiguity and
  stakeholder coordination*, not code size — a small but underspecified CR can be spec-heavy.
- **Developer effort:** implementation + tests (to the project's own coverage/quality bar) +
  any reusable-UI or documentation work + validation + code review and rework. Count whatever
  structural discipline the project enforces as real cost.

Use a Fibonacci-style SP scale (0.5, 1, 2, 3, 5, 8, 13, 21). Default reference bands
(**tunable** — adjust to team velocity; say so if you do):

| Complexity | Story-spec SP (RE/PO) | Developer SP (impl+tests+review) |
| --- | --- | --- |
| Trivial | 0.5 _(4 h)_ | 0.5-1 _(4-8 h)_ |
| Low | 0.5-1 _(4-8 h)_ | 1-2 _(8-16 h)_ |
| Medium | 1 _(8 h)_ | 2-3 _(16-24 h)_ |
| High | 1-2 _(8-16 h)_ | 3-8 _(24-64 h)_ |
| Very High | 2-3+ _(16-24+ h)_ | 8-21+ _(64-168+ h)_ |

Start from the band, then nudge within/across it for the specific drivers (e.g. a Medium CR
that also needs a contract change + migration leans toward the High dev band). Snap to the
nearest scale point rather than inventing fine-grained values. Always show the reasoning, not
just the number.

### 5. Risks, dependencies, recommendation

- **Risks & unknowns** — what could blow the estimate up, and the assumption each rests on.
- **Dependencies** — other CRs/specs, external systems, approvals.
- **Recommendation** — proceed to spec / split into smaller CRs / needs clarification first /
  reject-as-scoped. One line, justified.

### 6. Emit the artifact

- Create specs/change-requests/CR-NNNN-short-slug/assessment.md (next free zero-padded id;
  create the specs/change-requests/ folder and a README.md index on first use).
- Fill in the assessment-template.md shipped alongside this skill.
- Add an index row (id · title · complexity · spec effort · dev effort · status).
- Set today's date (check the current date in project context; don't invent dates).
- Summarize the four answers back to the user inline, with the artifact path.

---

## Guardrails

- **Estimate, don't implement.** No production code in this workflow.
- **Ground component claims in real files** — grep, don't guess.
- **Ranges with confidence**, never a single false-precise number.
- **Two efforts stay separate** — Story-spec (RE/PO) and Developer effort are different lines.
- **Surface ambiguity before estimating** — flag blocking questions first.
- The numbers are a *rough* decision aid for go/no-go and planning, not a quote.
`;
}
