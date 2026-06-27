# Specifications

This folder holds **concrete, reviewable feature specifications** for T3 Code / `t3work`.

A spec answers: *what are we building, why, how does it behave, and how do we know it's
done?* It is the contract reviewed and agreed **before** implementation, and kept current
as the source of truth **after**.

This is distinct from [`docs/`](../docs/), which holds product narrative, architecture
overviews, and reference material. In particular, [`docs/t3work-mvp/`](../docs/t3work-mvp/)
holds the high-level **epic** and vision documents; a `specs/` entry is the detailed,
buildable specification that an epic eventually breaks down into.

## Layout

```
specs/
├── README.md                  # this file
├── TEMPLATE.md                # copy to start a new spec
├── NNNN-short-slug/           # one folder per spec, zero-padded sequential id
│   ├── spec.md                # the specification
│   └── assets/                # diagrams, mockups, sample payloads (optional)
└── archive/                   # superseded or rejected specs, kept for history
```

## Conventions

- **Numbering** — sequential, zero-padded to 4 digits (`0001`, `0002`, ...). The number is
  permanent and never reused, even if the spec is rejected or superseded.
- **Slug** — short, kebab-case, describes the feature (`0007-jira-comment-review`).
- **Filenames** — kebab-case, matching the rest of the repo.
- **One spec, one concern** — if a spec grows two distinct deliverables, split it.

## Status lifecycle

Every spec records a status in its front-matter table:

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
4. Add a row to the index below.

## Index

| ID   | Spec                                        | Status | Owner |
| ---- | ------------------------------------------- | ------ | ----- |
| 0001 | [Example feature](./0001-example-feature/spec.md) | Draft  | —     |
