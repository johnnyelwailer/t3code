/**
 * The PR diff explorer: one file at a time, navigated from a file tree with per-file
 * "viewed" checkboxes.
 *
 * Prototype seam: this component is presentational — the parsed diff files and the
 * full-file loader are handed in by the caller, so the Storybook story can feed it sample
 * data and the real Code tab can feed it the host's slices.
 */
import type { FileDiffMetadata, FileDiffContentsLoader } from "@pierre/diffs";
import {
  CheckCheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisIcon,
  FolderIcon,
  FolderOpenIcon,
  PanelRightCloseIcon,
  PanelRightIcon,
} from "lucide-react";
import * as Schema from "effect/Schema";
import { useEffect, useMemo, useState } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useTheme } from "~/hooks/useTheme";
import {
  buildFileDiffRenderKey,
  getDiffLineStat,
  resolveDiffThemeName,
  resolveFileDiffPath,
  resolveFileDiffPreviousPath,
} from "~/lib/diffRendering";
import { PREFERRED_HIGHLIGHTER } from "~/lib/syntaxHighlighting";
import { cn } from "~/lib/utils";

import { StyledDiffCodeView } from "../diffs/StyledDiffCodeView";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  buildDiffExplorerTree,
  compactDiffExplorerTree,
  countViewedFiles,
  diffExplorerDirectoryPaths,
  diffExplorerFileCount,
  markAllFilesViewed,
  nextDiffExplorerFile,
  previousDiffExplorerFile,
  toggleViewedFile,
  type DiffExplorerFile,
  type DiffExplorerNode,
} from "./t3team-prDiffExplorer.logic";

type ExplorerMode = "focus" | "list";
type ExplorerLayout = "stacked" | "split";

function fileInfoFromDiff(file: FileDiffMetadata): DiffExplorerFile {
  let additions = 0;
  let deletions = 0;
  for (const hunk of file.hunks) {
    additions += hunk.additionLines;
    deletions += hunk.deletionLines;
  }
  const path = resolveFileDiffPath(file);
  const oldPath = resolveFileDiffPreviousPath(file);
  return {
    key: buildFileDiffRenderKey(file),
    path,
    oldPath: oldPath === path ? null : oldPath,
    additions,
    deletions,
  };
}

function DiffStat({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
      <span className="text-emerald-600 dark:text-emerald-500">+{additions}</span>
      <span className="text-rose-600 dark:text-rose-500">-{deletions}</span>
    </span>
  );
}

/**
 * One directory level of the tree. Nesting plus the left border gives each level its own
 * indent, so the hierarchy reads as a tree instead of a repeated path list.
 */
function TreeLevel({
  nodes,
  depth,
  selectedKey,
  viewed,
  openDirectories,
  onSelectFile,
  onToggleViewed,
  onToggleDirectory,
}: {
  nodes: readonly DiffExplorerNode[];
  depth: number;
  selectedKey: string | null;
  viewed: ReadonlySet<string>;
  openDirectories: ReadonlySet<string>;
  onSelectFile: (key: string) => void;
  onToggleViewed: (key: string) => void;
  onToggleDirectory: (path: string) => void;
}) {
  return (
    <ul
      role={depth === 0 ? "tree" : "group"}
      aria-label={depth === 0 ? "Pull request files" : undefined}
      className={cn(depth > 0 && "ml-[15px] border-l border-border/40 pl-2")}
    >
      {nodes.map((node) => {
        if (node.kind === "directory") {
          const open = openDirectories.has(node.path);
          return (
            <li key={node.path}>
              <button
                type="button"
                onClick={() => onToggleDirectory(node.path)}
                aria-expanded={open}
                className="flex h-7 w-full items-center gap-1.5 rounded px-1.5 text-left text-xs text-foreground/90 hover:bg-foreground/[0.06]"
              >
                <span className="shrink-0 text-muted-foreground">
                  {open ? (
                    <ChevronDownIcon className="size-3.5" />
                  ) : (
                    <ChevronRightIcon className="size-3.5" />
                  )}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {open ? (
                    <FolderOpenIcon className="size-3.5" />
                  ) : (
                    <FolderIcon className="size-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                  {diffExplorerFileCount(node.children)}
                </span>
              </button>
              {open ? (
                <TreeLevel
                  nodes={node.children}
                  depth={depth + 1}
                  selectedKey={selectedKey}
                  viewed={viewed}
                  openDirectories={openDirectories}
                  onSelectFile={onSelectFile}
                  onToggleViewed={onToggleViewed}
                  onToggleDirectory={onToggleDirectory}
                />
              ) : null}
            </li>
          );
        }
        const file = node.file;
        const selected = file.key === selectedKey;
        const isViewed = viewed.has(file.key);
        const name = file.path.split("/").at(-1) ?? file.path;
        return (
          <li key={file.key}>
            <div
              role="treeitem"
              aria-selected={selected}
              tabIndex={0}
              onClick={() => onSelectFile(file.key)}
              onKeyDown={(event) => {
                // The checkbox answers Space itself; only the row answers its own presses.
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectFile(file.key);
                }
              }}
              className={cn(
                "flex h-7 w-full cursor-pointer items-center gap-1.5 rounded px-1.5 text-xs outline-none",
                "hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring",
                selected && "bg-foreground/[0.08]",
              )}
            >
              <Checkbox
                aria-label={`Mark ${file.path} as ${isViewed ? "not viewed" : "viewed"}`}
                checked={isViewed}
                onCheckedChange={() => onToggleViewed(file.key)}
                onClick={(event) => event.stopPropagation()}
                className="size-3.5 sm:size-3.5"
              />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        isViewed ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {name}
                    </span>
                  }
                />
                <TooltipPopup side="top">{file.path}</TooltipPopup>
              </Tooltip>
              <DiffStat additions={file.additions} deletions={file.deletions} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PullRequestDiffExplorer({
  files,
  loadDiffFiles,
  storageKey,
}: {
  /** Parsed diff files, in the diff's own order. */
  files: readonly FileDiffMetadata[];
  /** Loads both sides of a file so the viewer can show the whole file, not just its hunks. */
  loadDiffFiles?: FileDiffContentsLoader | null;
  /** Namespaced storage key for the viewed-file checkboxes (one per pull request). */
  storageKey: string;
}) {
  const { resolvedTheme } = useTheme();
  const [mode, setMode] = useState<ExplorerMode>("focus");
  const [layout, setLayout] = useState<ExplorerLayout>("stacked");
  const [fullFile, setFullFile] = useState(true);
  const [treeOpen, setTreeOpen] = useLocalStorage<boolean, boolean>(
    "t3code.prDiff.treeOpen",
    true,
    Schema.Boolean,
  );
  const [viewedKeys, setViewedKeys] = useLocalStorage<readonly string[], readonly string[]>(
    `t3code.prDiff.viewed:${storageKey}`,
    [],
    Schema.Array(Schema.String),
  );
  const viewed = useMemo(() => new Set(viewedKeys), [viewedKeys]);

  const fileInfo = useMemo(() => files.map(fileInfoFromDiff), [files]);
  const [selectedKey, setSelectedKey] = useState<string | null>(fileInfo[0]?.key ?? null);
  const tree = useMemo(() => compactDiffExplorerTree(buildDiffExplorerTree(fileInfo)), [fileInfo]);
  const allDirectories = useMemo(() => diffExplorerDirectoryPaths(tree), [tree]);
  const [openDirectories, setOpenDirectories] = useState<ReadonlySet<string>>(
    () => new Set(allDirectories),
  );
  const lineStat = useMemo(() => getDiffLineStat(files), [files]);
  const counts = useMemo(() => countViewedFiles(fileInfo, viewed), [fileInfo, viewed]);

  // A file that left the diff (refresh, force-push) should not stay selected or open.
  useEffect(() => {
    if (fileInfo.length === 0) return;
    if (!fileInfo.some((file) => file.key === selectedKey)) {
      setSelectedKey(fileInfo[0]?.key ?? null);
    }
  }, [fileInfo, selectedKey]);

  const selectedFile = useMemo(
    () => fileInfo.find((file) => file.key === selectedKey) ?? null,
    [fileInfo, selectedKey],
  );

  const selectFile = (key: string) => setSelectedKey(key);
  const toggleViewed = (key: string) =>
    setViewedKeys((current) => [...toggleViewedFile(new Set(current), key)]);
  const toggleDirectory = (path: string) =>
    setOpenDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const step = (direction: "previous" | "next") => {
    if (selectedKey === null) return;
    const target =
      direction === "next"
        ? nextDiffExplorerFile(fileInfo, selectedKey)
        : previousDiffExplorerFile(fileInfo, selectedKey);
    if (target !== null) setSelectedKey(target.key);
  };

  const viewerItems = useMemo(
    () =>
      files
        .filter((file) => mode === "list" || buildFileDiffRenderKey(file) === selectedKey)
        .map((file) => ({
          id: buildFileDiffRenderKey(file),
          type: "diff" as const,
          fileDiff: file,
          version: 0,
        })),
    [files, mode, selectedKey],
  );

  const options = useMemo(
    () => ({
      diffStyle: layout === "split" ? ("split" as const) : ("unified" as const),
      lineDiffType: "none" as const,
      overflow: "scroll" as const,
      theme: resolveDiffThemeName(resolvedTheme),
      preferredHighlighter: PREFERRED_HIGHLIGHTER,
      themeType: resolvedTheme,
      stickyHeaders: true,
      expandUnchanged: fullFile,
      ...(loadDiffFiles !== null && loadDiffFiles !== undefined ? { loadDiffFiles } : {}),
    }),
    [layout, fullFile, loadDiffFiles, resolvedTheme],
  );

  const showTree = mode === "focus" && treeOpen;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar: navigation in front, view options tucked into the ellipsis menu. */}
      <div className="flex h-10 min-h-10 shrink-0 items-center gap-2 border-b border-border/60 bg-background px-3 text-xs text-muted-foreground">
        {mode === "focus" ? (
          <>
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Previous file"
                      onClick={() => step("previous")}
                    />
                  }
                >
                  <ChevronLeftIcon className="size-3.5" />
                </TooltipTrigger>
                <TooltipPopup side="bottom">Previous file</TooltipPopup>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Next file"
                      onClick={() => step("next")}
                    />
                  }
                >
                  <ChevronRightIcon className="size-3.5" />
                </TooltipTrigger>
                <TooltipPopup side="bottom">Next file</TooltipPopup>
              </Tooltip>
            </div>
            {selectedFile ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {selectedFile.path.split("/").at(-1) ?? selectedFile.path}
                    </span>
                  }
                />
                <TooltipPopup side="top">{selectedFile.path}</TooltipPopup>
              </Tooltip>
            ) : (
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">No file</span>
            )}
          </>
        ) : (
          <>
            <span className="font-medium text-foreground">All files</span>
            <span className="tabular-nums">{fileInfo.length}</span>
            <span className="min-w-0 flex-1" />
          </>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <DiffStat additions={lineStat.additions} deletions={lineStat.deletions} />
          {mode === "focus" ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={treeOpen ? "Hide the file tree" : "Show the file tree"}
                    onClick={() => setTreeOpen(!treeOpen)}
                  />
                }
              >
                {treeOpen ? (
                  <PanelRightCloseIcon className="size-3.5" />
                ) : (
                  <PanelRightIcon className="size-3.5" />
                )}
              </TooltipTrigger>
              <TooltipPopup side="bottom">
                {treeOpen ? "Hide file tree" : "Show file tree"}
              </TooltipPopup>
            </Tooltip>
          ) : null}
          <Menu>
            <MenuTrigger
              render={
                <Button type="button" variant="ghost" size="icon-xs" aria-label="View options" />
              }
            >
              <EllipsisIcon className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end" className="w-56">
              <MenuGroup>
                <MenuGroupLabel>View</MenuGroupLabel>
                <MenuRadioGroup
                  value={mode}
                  onValueChange={(next) => {
                    if (next === "focus" || next === "list") setMode(next);
                  }}
                >
                  <MenuRadioItem value="focus">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1">One file at a time</span>
                      <MenuRadioItemIndicator />
                    </span>
                  </MenuRadioItem>
                  <MenuRadioItem value="list">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1">All files</span>
                      <MenuRadioItemIndicator />
                    </span>
                  </MenuRadioItem>
                </MenuRadioGroup>
              </MenuGroup>
              <MenuSeparator />
              <MenuGroup>
                <MenuGroupLabel>Layout</MenuGroupLabel>
                <MenuRadioGroup
                  value={layout}
                  onValueChange={(next) => {
                    if (next === "stacked" || next === "split") setLayout(next);
                  }}
                >
                  <MenuRadioItem value="stacked">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1">Stacked</span>
                      <MenuRadioItemIndicator />
                    </span>
                  </MenuRadioItem>
                  <MenuRadioItem value="split">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1">Side by side</span>
                      <MenuRadioItemIndicator />
                    </span>
                  </MenuRadioItem>
                </MenuRadioGroup>
              </MenuGroup>
              <MenuSeparator />
              <MenuGroup>
                <MenuGroupLabel>Context</MenuGroupLabel>
                <MenuRadioGroup
                  value={fullFile ? "full-file" : "hunks"}
                  onValueChange={(next) => setFullFile(next === "full-file")}
                >
                  <MenuRadioItem value="hunks">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1">Changes only</span>
                      <MenuRadioItemIndicator />
                    </span>
                  </MenuRadioItem>
                  <MenuRadioItem value="full-file">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1">Full file</span>
                      <MenuRadioItemIndicator />
                    </span>
                  </MenuRadioItem>
                </MenuRadioGroup>
              </MenuGroup>
            </MenuPopup>
          </Menu>
        </div>
      </div>
      {/* Diff and tree scroll independently: each pane owns its overflow. */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-h-0 min-w-0 flex-1">
          <StyledDiffCodeView
            className="h-full overflow-auto [scrollbar-gutter:stable]"
            items={viewerItems}
            options={options}
          />
          {mode === "focus" && selectedFile === null ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">Select a file to review.</p>
          ) : null}
        </div>
        {showTree ? (
          <aside className="flex w-[min(20rem,40%)] min-w-56 shrink-0 flex-col border-l border-border/60 bg-background">
            <div className="flex h-10 min-h-10 shrink-0 items-center gap-1.5 border-b border-border/60 px-2 text-xs text-muted-foreground">
              <span className="px-1 font-medium text-foreground">Files</span>
              <span className="tabular-nums">{fileInfo.length}</span>
              <span className="ml-auto tabular-nums text-[11px]">
                {counts.viewed}/{counts.total} viewed
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Mark all files as viewed"
                      onClick={() => setViewedKeys([...markAllFilesViewed(fileInfo)])}
                    />
                  }
                >
                  <CheckCheckIcon className="size-3.5" />
                </TooltipTrigger>
                <TooltipPopup side="bottom">Mark all as viewed</TooltipPopup>
              </Tooltip>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5"
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  step("next");
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  step("previous");
                }
              }}
            >
              <TreeLevel
                nodes={tree}
                depth={0}
                selectedKey={selectedKey}
                viewed={viewed}
                openDirectories={openDirectories}
                onSelectFile={selectFile}
                onToggleViewed={toggleViewed}
                onToggleDirectory={toggleDirectory}
              />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export default PullRequestDiffExplorer;
