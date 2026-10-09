import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";

/** Jira project avatar, falling back to the project key's first letters. */
export function JiraProjectGlyph({ entry }: { entry: JiraCatalogProject }) {
  if (entry.iconUrl) {
    return <img src={entry.iconUrl} alt="" className="size-4 shrink-0 rounded-sm" />;
  }
  return (
    <span aria-hidden="true" className="text-3xs font-semibold uppercase leading-none">
      {(entry.key ?? entry.title).slice(0, 2)}
    </span>
  );
}
