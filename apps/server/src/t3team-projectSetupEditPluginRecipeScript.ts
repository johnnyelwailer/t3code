export function renderEditPluginModuleScript(): string {
  return `import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TARGET_PATH_ARTIFACT = "artifacts/target-path.txt";
const ORIGINAL_SOURCE_ARTIFACT = "artifacts/original-source.txt";
const PROPOSED_SOURCE_ARTIFACT = "artifacts/proposed-source.txt";
const PROPOSED_DIFF_ARTIFACT = "artifacts/proposed.diff";

function readTargetPath(recipe) {
  const targetPath = recipe?.parameters?.targetPath;
  if (typeof targetPath === "string" && targetPath.trim().length > 0) {
    return targetPath.trim();
  }
  throw new Error("edit-plugin-module requires parameters.targetPath.");
}

function resolveTargetPath(workspaceRoot, requestedPath) {
  const targetPath = path.isAbsolute(requestedPath)
    ? requestedPath
    : path.resolve(workspaceRoot, requestedPath);
  const relativePath = path.relative(workspaceRoot, targetPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Target path '" + requestedPath + "' resolves outside the workspace root.");
  }
  return targetPath;
}

function detectModuleKind(sourceText) {
  const trimmed = sourceText.trimStart();
  if (trimmed.startsWith("{")) {
    return "recipe-manifest";
  }
  if (/createBundled[A-Za-z]*\\s*\\(/.test(sourceText)) {
    return "bundled-recipe";
  }
  if (/define[A-Za-z]*Section\\s*\\(/.test(sourceText)) {
    return "section-module";
  }
  if (/define[A-Za-z]*Recipe\\s*\\(/.test(sourceText)) {
    return "recipe-module";
  }
  return "generic-module";
}

function normalizeDraftSource(nextSource, originalSource) {
  if (nextSource.endsWith("\\n") || !originalSource.endsWith("\\n")) {
    return nextSource;
  }
  return nextSource + "\\n";
}

async function writeRunArtifact(runPath, relativePath, contents) {
  const targetPath = path.join(runPath, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, contents, "utf8");
}

async function readRunArtifact(runPath, relativePath) {
  return readFile(path.join(runPath, relativePath), "utf8");
}

function buildUnifiedDiff(fileLabel, originalSource, nextSource) {
  if (originalSource === nextSource) {
    return "No changes proposed for " + fileLabel + ".";
  }

  const originalLines = originalSource.split("\\n");
  const nextLines = nextSource.split("\\n");
  let start = 0;

  while (
    start < originalLines.length &&
    start < nextLines.length &&
    originalLines[start] === nextLines[start]
  ) {
    start += 1;
  }

  let originalEnd = originalLines.length - 1;
  let nextEnd = nextLines.length - 1;
  while (
    originalEnd >= start &&
    nextEnd >= start &&
    originalLines[originalEnd] === nextLines[nextEnd]
  ) {
    originalEnd -= 1;
    nextEnd -= 1;
  }

  const contextStart = Math.max(0, start - 2);
  const originalDisplayEnd = Math.min(originalLines.length - 1, originalEnd + 2);
  const nextDisplayEnd = Math.min(nextLines.length - 1, nextEnd + 2);
  const diffLines = [
    "--- a/" + fileLabel,
    "+++ b/" + fileLabel,
    "@@ -" +
      String(contextStart + 1) +
      "," +
      String(Math.max(1, originalDisplayEnd - contextStart + 1)) +
      " +" +
      String(contextStart + 1) +
      "," +
      String(Math.max(1, nextDisplayEnd - contextStart + 1)) +
      " @@",
  ];

  for (let lineIndex = contextStart; lineIndex < start; lineIndex += 1) {
    diffLines.push(" " + originalLines[lineIndex]);
  }
  for (let lineIndex = start; lineIndex <= originalEnd; lineIndex += 1) {
    diffLines.push("-" + originalLines[lineIndex]);
  }
  for (let lineIndex = start; lineIndex <= nextEnd; lineIndex += 1) {
    diffLines.push("+" + nextLines[lineIndex]);
  }
  for (
    let lineIndex = Math.max(start, originalEnd + 1);
    lineIndex <= originalDisplayEnd;
    lineIndex += 1
  ) {
    diffLines.push(" " + originalLines[lineIndex]);
  }

  return diffLines.join("\\n");
}

export async function prepareEditWorkspace(context, api) {
  const targetPath = resolveTargetPath(context.workspaceRoot, readTargetPath(context.recipe));
  const originalSource = await readFile(targetPath, "utf8");
  const recipePrompt = await readFile(path.join(context.recipePath, "prompt.md"), "utf8");
  const userRequest = await api.workspace.readText("prompt.md");
  const moduleKind = detectModuleKind(originalSource);
  const draftArtifactPath = path.relative(
    context.workspaceRoot,
    path.join(context.runPath, PROPOSED_SOURCE_ARTIFACT),
  );

  await Promise.all([
    writeRunArtifact(context.runPath, TARGET_PATH_ARTIFACT, targetPath + "\\n"),
    writeRunArtifact(context.runPath, ORIGINAL_SOURCE_ARTIFACT, originalSource),
    api.workspace.writeText(
      "draft-prompt.md",
      [
        recipePrompt.trim(),
        "",
        "Active guidance section: " + moduleKind,
        "Target source path: " + targetPath,
        "Draft artifact path: " + draftArtifactPath,
        "",
        "User request:",
        userRequest.trim(),
        "",
        "Current source:",
        "~~~",
        originalSource,
        "~~~",
        "",
        "Write the full updated source to the draft artifact path.",
        "Do not modify the real source file yet.",
        "After writing the draft artifact, reply briefly that the draft is ready.",
        "",
      ].join("\\n"),
    ),
  ]);
}

export async function presentEditPreview(context) {
  const targetPath = (await readRunArtifact(context.runPath, TARGET_PATH_ARTIFACT)).trim();
  const originalSource = await readRunArtifact(context.runPath, ORIGINAL_SOURCE_ARTIFACT);
  const proposedSource = normalizeDraftSource(
    await readRunArtifact(context.runPath, PROPOSED_SOURCE_ARTIFACT),
    originalSource,
  );
  const displayPath = path.relative(context.workspaceRoot, targetPath) || path.basename(targetPath);
  const diffText = buildUnifiedDiff(displayPath, originalSource, proposedSource);

  await Promise.all([
    writeRunArtifact(context.runPath, PROPOSED_SOURCE_ARTIFACT, proposedSource),
    writeRunArtifact(context.runPath, PROPOSED_DIFF_ARTIFACT, diffText + "\\n"),
  ]);

  return {
    kind: "artifact-preview",
    id: "edit-preview-card",
    title: "Review proposed edits for " + path.basename(targetPath),
    body: ["Target: " + displayPath, "", "~~~diff", diffText, "~~~", ""].join("\\n"),
    actions: [{ id: "approve", label: "Approve changes", style: "primary" }],
  };
}

export async function saveApprovedEdit(context) {
  const targetPath = (await readRunArtifact(context.runPath, TARGET_PATH_ARTIFACT)).trim();
  const originalSource = await readRunArtifact(context.runPath, ORIGINAL_SOURCE_ARTIFACT);
  const proposedSource = normalizeDraftSource(
    await readRunArtifact(context.runPath, PROPOSED_SOURCE_ARTIFACT),
    originalSource,
  );

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, proposedSource, "utf8");
}
`;
}
