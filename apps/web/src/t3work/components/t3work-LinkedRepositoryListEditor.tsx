import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/t3work/components/ui/t3work-button";
import { Input } from "~/t3work/components/ui/t3work-input";
import { parseRepositoryLabel } from "~/t3work/components/t3work-linkedRepositories";

export function LinkedRepositoryListEditor({
  repositoryUrls,
  newRepositoryUrl,
  setNewRepositoryUrl,
  onAddRepository,
  onRemoveRepository,
  onAddSearchableOption,
  searchableRepositoryOptions,
  inputPlaceholder = "https://github.com/org/repo",
  emptyMessage = "No linked repositories yet.",
  helpText,
}: {
  repositoryUrls: ReadonlyArray<string>;
  newRepositoryUrl: string;
  setNewRepositoryUrl: (value: string) => void;
  onAddRepository: () => void;
  onRemoveRepository: (url: string) => void;
  onAddSearchableOption?: (url: string) => void;
  searchableRepositoryOptions?: ReadonlyArray<string>;
  inputPlaceholder?: string;
  emptyMessage?: string;
  helpText?: string;
}) {
  const [inputFocused, setInputFocused] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) {
        clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  const availableOptions = useMemo(() => {
    const deduped = new Set<string>();
    for (const value of searchableRepositoryOptions ?? []) {
      const trimmed = value.trim();
      if (trimmed.length === 0) continue;
      deduped.add(trimmed);
    }
    return [...deduped.values()];
  }, [searchableRepositoryOptions]);

  const filteredOptions = useMemo(() => {
    const query = newRepositoryUrl.trim().toLowerCase();
    if (!query) return availableOptions.slice(0, 8);
    return availableOptions
      .filter((url) => {
        const label = parseRepositoryLabel(url).toLowerCase();
        return label.includes(query) || url.toLowerCase().includes(query);
      })
      .slice(0, 8);
  }, [availableOptions, newRepositoryUrl]);

  const showSuggestionList = inputFocused && availableOptions.length > 0;

  return (
    <div className="space-y-3">
      <div className="relative flex gap-2">
        <Input
          value={newRepositoryUrl}
          onChange={(event) => setNewRepositoryUrl(event.target.value)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => {
            if (blurTimerRef.current !== null) {
              clearTimeout(blurTimerRef.current);
            }
            blurTimerRef.current = setTimeout(() => setInputFocused(false), 120);
          }}
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
        {showSuggestionList ? (
          <div className="absolute top-full right-[4.5rem] left-0 z-20 mt-1 rounded-md border border-border/70 bg-background p-1 shadow-sm">
            <ul className="space-y-1">
              {filteredOptions.map((url) => {
                const isLinked = repositoryUrls.includes(url);
                return (
                  <li key={url}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-accent/35"
                      onClick={() => {
                        setNewRepositoryUrl(url);
                        if (!isLinked) onAddSearchableOption?.(url);
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {parseRepositoryLabel(url)}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {url}
                        </span>
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {isLinked ? "Use" : "Add"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
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
