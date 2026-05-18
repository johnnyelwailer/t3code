import { Button } from "~/t3work/components/ui/t3work-button";
import { Input } from "~/t3work/components/ui/t3work-input";
import { parseRepositoryLabel } from "~/t3work/components/t3work-linkedRepositories";

export function LinkedRepositoryListEditor({
  repositoryUrls,
  newRepositoryUrl,
  setNewRepositoryUrl,
  onAddRepository,
  onRemoveRepository,
  inputPlaceholder = "https://github.com/org/repo",
  emptyMessage = "No linked repositories yet.",
  helpText,
}: {
  repositoryUrls: ReadonlyArray<string>;
  newRepositoryUrl: string;
  setNewRepositoryUrl: (value: string) => void;
  onAddRepository: () => void;
  onRemoveRepository: (url: string) => void;
  inputPlaceholder?: string;
  emptyMessage?: string;
  helpText?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={newRepositoryUrl}
          onChange={(event) => setNewRepositoryUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAddRepository();
            }
          }}
          placeholder={inputPlaceholder}
        />
        <Button variant="outline" onClick={onAddRepository}>
          Add
        </Button>
      </div>
      {repositoryUrls.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {repositoryUrls.map((url) => (
            <li
              key={url}
              className="flex items-center justify-between gap-2 rounded-md border border-border/70 px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{parseRepositoryLabel(url)}</div>
                <div className="truncate text-xs text-muted-foreground">{url}</div>
              </div>
              <Button variant="ghost" size="xs" onClick={() => onRemoveRepository(url)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {helpText ? <p className="text-xs text-muted-foreground">{helpText}</p> : null}
    </div>
  );
}
