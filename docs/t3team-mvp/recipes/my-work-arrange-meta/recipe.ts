// My Work arrange (meta) — recipe module. Copy-ready for a pack's recipes/ directory.
//
// Interviews the user, iterates a DRAFT arrangement on the real My Work board until they keep it,
// then writes a project-scoped maintain recipe and launches it. Supersedes the one-shot
// arrange-my-work preset as the sidebar's arrange action.

import { defineRecipe, defineWorkflow } from "@t3team/sdk";

import type * as Workflow from "./workflow.ts";

export default defineRecipe({
  id: "my-work-arrange-meta",
  version: "0.1.0",
  scope: "project",
  title: "Arrange My Work with me",
  shortDescription:
    "Answer a few questions, shape the board live, then keep it. A recipe keeps it current.",
  surfaces: ["project.dashboard.myWork"],
  icon: "sparkles",
  rank: 90,
  // Read the digest, write draft/live arrangements and the maintain recipe (view state),
  // and launch the maintain workflow (thread.handoff).
  allowedToolGroups: ["integration.read", "view.state", "thread.handoff"],
  slashAlias: "arrange-meta",
  defaultAction: defineWorkflow<typeof Workflow>("./workflow.ts"),
});
