import type { ProjectStateMigration } from "@t3tools/contracts";

const TONE_CLASS = {
  progress: "text-primary",
  ready: "text-muted-foreground",
  error: "text-destructive",
} as const;

export function describeProjectStateMigration(migration: ProjectStateMigration): {
  readonly tone: keyof typeof TONE_CLASS;
  readonly label: string;
  readonly detail?: string;
} {
  switch (migration.status) {
    case "pending":
      return { tone: "progress", label: "Starting a thread to move the project state" };
    case "running":
      return {
        tone: "progress",
        label: "Moving the project state in the “Migrate project state” thread",
        ...(migration.missingFilesAtLeast
          ? { detail: `at least ${migration.missingFilesAtLeast.toLocaleString("en-US")} files` }
          : {}),
      };
    case "completed":
      return {
        tone: "ready",
        label: "Project state moved into the main repository",
        ...(migration.conflicts
          ? {
              detail: `${migration.conflicts} conflicting files kept the main repository's version`,
            }
          : {}),
      };
    case "failed":
      return {
        tone: "error",
        label: "Moving the project state failed",
        ...(migration.error ? { detail: migration.error } : {}),
      };
  }
}

/** The main-repository state migration under the picker; nothing when none was handed off. */
export function ProjectStateMigrationStatusLine({
  migration,
}: {
  migration: ProjectStateMigration | null;
}) {
  if (!migration) return null;
  const view = describeProjectStateMigration(migration);
  return (
    <div role="status" className={`mt-2 text-2xs ${TONE_CLASS[view.tone]}`}>
      {view.label}
      {view.detail ? ` — ${view.detail}` : null}
      {migration.pullRequestUrl ? (
        <>
          {" · "}
          <a className="underline" href={migration.pullRequestUrl} target="_blank" rel="noreferrer">
            pull request
          </a>
        </>
      ) : null}
    </div>
  );
}
