# Epic 08: Rich Artifacts

## Purpose

Recipes should produce durable, rich outputs by default. The user should receive more
than a paragraph in chat.

## Artifact Model

```ts
type RichArtifact = {
  id: string;
  projectId: string;
  title: string;
  kind: string;
  format: "md" | "mdx" | "html" | "blocks";
  blocks?: ArtifactBlock[];
  sourceRefs: ResourceRef[];
  createdByThreadId?: string;
  createdAt: string;
  updatedAt: string;
};
```

## Formats

- Markdown for fallback and portability.
- MDX for rich persistent documents.
- HTML for standalone previews.
- Block JSON for interactive app-native rendering.

## Initial Block Types

- text
- callout
- table
- checklist
- test matrix
- risk list
- timeline
- status board
- form
- mutation preview
- link list
- attachment grid

## Persistence

Suggested workspace paths:

```text
plans/
  <plan-id>.mdx
documents/
  <artifact-id>.mdx
  <artifact-id>.json
runs/
  <thread-id>/
    artifacts.json
```

Skills should persist:

- plans
- test matrices
- risk boards
- comment drafts
- release checklists
- generated summaries
- source references

## Viewer Requirements

The shell should provide:

- artifact list on project overview
- artifact list on resource detail
- artifact side panel from thread view
- source reference links
- export fallback where useful
- mutation preview rendering

## Building Blocks For Skills

Prompt building blocks:

- simple-language profile
- QA reviewer profile
- product explainer profile
- bug reproduction profile
- Jira comment drafting rules
- requirement ambiguity checklist
- acceptance criteria extraction checklist
- risk severity rubric
- test case format

Artifact building blocks:

- ticket summary
- acceptance criteria review
- open questions
- test case matrix
- bug reproduction steps
- risk register
- release checklist
- Jira comment draft
- decision log entry
- follow-up action list

Data building blocks:

- Jira issue snapshot
- Jira project snapshot
- user/account profile
- project glossary
- known environments
- prior artifacts
- recent related issues
