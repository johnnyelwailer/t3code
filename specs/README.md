# Specifications

This folder is the **single source of truth** for what T3 Code / `t3work` is building. It
holds two tiers:

- **Epics & vision** — [`epics/`](./epics/): the high-level product vision, scope,
  architecture, and per-epic narrative. Start at [`epics/README.md`](./epics/README.md).
  *(This is the former `docs/t3work-mvp/` set, relocated here so there is one spec home.)*
- **Buildable specs** — `NNNN-short-slug/`: the detailed, reviewable specification an epic
  breaks down into. A spec answers *what are we building, why, how does it behave, and how do
  we know it's done?* — the contract agreed **before** implementation and kept current as the
  source of truth **after**.

Delivery-profile specs live in [`roles/`](./roles/00_README.md). Product narrative and
reference material that isn't a spec still lives in [`docs/`](../docs/).

## Layout

```
specs/
├── README.md                  # this file — the spec index
├── TEMPLATE.md                # copy to start a new buildable spec
├── epics/                     # epic & vision documents (see epics/README.md)
├── roles/                     # delivery-profile specs (see roles/00_README.md)
├── NNNN-short-slug/           # one folder per buildable spec, zero-padded sequential id
│   ├── spec.md                # the specification
│   └── assets/                # diagrams, mockups, sample payloads (optional)
└── archive/                   # superseded or rejected specs, kept for history
```

## Conventions

- **Numbering** — buildable specs are sequential, zero-padded to 4 digits (`0001`, `0002`,
  ...). The number is permanent and never reused, even if the spec is rejected or superseded.
- **Slug** — short, kebab-case, describes the feature (`0007-jira-comment-review`).
- **Filenames** — kebab-case, matching the rest of the repo.
- **One spec, one concern** — if a spec grows two distinct deliverables, split it.

## Status lifecycle

Every buildable spec records a status in its front-matter table:

| Status        | Meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `Draft`       | Being written; not yet ready for review.                       |
| `Review`      | Open for feedback / approval.                                  |
| `Approved`    | Agreed and ready to build.                                     |
| `Implemented` | Shipped; spec reflects what was built.                         |
| `Superseded`  | Replaced by another spec (link it); moved to `archive/`.       |
| `Rejected`    | Decided against (keep the reasoning); moved to `archive/`.     |

## Writing a new spec

1. Pick the next free number.
2. `cp TEMPLATE.md NNNN-short-slug/spec.md` (create the folder).
3. Fill it in, set status `Draft`, open a PR.
4. Add a row to the buildable-specs index below.

## Index

### Epics & vision

The full catalog (vision, product scope, additive architecture, and the 30+ epic documents)
is indexed in [`epics/README.md`](./epics/README.md).

### Delivery profiles

The 11 delivery-profile specs are indexed in [`roles/00_README.md`](./roles/00_README.md).

### Buildable specs

| ID   | Spec                                              | Status | Owner |
| ---- | ------------------------------------------------- | ------ | ----- |
| 0001 | [Example feature](./0001-example-feature/spec.md) | Draft  | —     |
