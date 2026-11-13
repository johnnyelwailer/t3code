import {
  HANDBOOK_DOCS_BASE_URL,
  HANDBOOK_DOCS_ROOT,
  HANDBOOK_INDEX_PATH,
  HANDBOOK_MARKDOWN_EXTENSIONS,
} from "./t3team-handbookConfig.ts";

const FRONTMATTER_TITLE = /^title:\s*["']?(.+?)["']?\s*$/m;
const HEADING = /^(#{1,6})\s+(.+?)\s*$/gm;

export function isHandbookMarkdownPath(path: string): boolean {
  if (path === HANDBOOK_INDEX_PATH) return true;
  if (!path.startsWith(`${HANDBOOK_DOCS_ROOT}/`)) return false;
  return HANDBOOK_MARKDOWN_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/** Strip repo-root prefixes agents often paste (`Source/docs/...`, docs URL, leading `/`). */
export function normalizeHandbookPath(input: string): string {
  const trimmed = input.trim().replace(/^\/+/, "");
  if (trimmed === "" || trimmed === "/" || trimmed === "index" || trimmed === "index.md") {
    return HANDBOOK_INDEX_PATH;
  }
  const withoutHost = trimmed
    .replace(/^https?:\/\/docs\.nexplore\.dev\/?/i, "")
    .replace(/^\/+/, "");
  if (withoutHost === "" || withoutHost === "index" || withoutHost === "index.md") {
    return HANDBOOK_INDEX_PATH;
  }
  if (withoutHost === HANDBOOK_INDEX_PATH || withoutHost.startsWith(`${HANDBOOK_DOCS_ROOT}/`)) {
    return withoutHost;
  }
  if (withoutHost.startsWith("docs/")) {
    return `Source/${withoutHost}`;
  }
  const withExt = HANDBOOK_MARKDOWN_EXTENSIONS.some((ext) => withoutHost.endsWith(ext))
    ? withoutHost
    : `${withoutHost}.md`;
  return `${HANDBOOK_DOCS_ROOT}/${withExt.replace(/^\/+/, "")}`;
}

export function handbookDocsUrl(path: string): string {
  if (path === HANDBOOK_INDEX_PATH) return `${HANDBOOK_DOCS_BASE_URL}/`;
  let relative = path.startsWith(`${HANDBOOK_DOCS_ROOT}/`)
    ? path.slice(HANDBOOK_DOCS_ROOT.length + 1)
    : path;
  for (const ext of HANDBOOK_MARKDOWN_EXTENSIONS) {
    if (relative.endsWith(ext)) {
      relative = relative.slice(0, -ext.length);
      break;
    }
  }
  if (relative.endsWith("/index")) relative = relative.slice(0, -"/index".length);
  if (relative === "index" || relative === "") return `${HANDBOOK_DOCS_BASE_URL}/`;
  return `${HANDBOOK_DOCS_BASE_URL}/${relative}`;
}

export function extractHandbookTitle(path: string, markdown: string): string {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (frontmatter?.[1] !== undefined) {
    const titled = FRONTMATTER_TITLE.exec(frontmatter[1]);
    if (titled?.[1]) return titled[1].trim();
  }
  HEADING.lastIndex = 0;
  const heading = HEADING.exec(markdown);
  if (heading?.[2]) return heading[2].replace(/[#*`]/g, "").trim();
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.(md|mdx)$/i, "").replace(/[-_]/g, " ");
}

export function extractHandbookHeadings(markdown: string): ReadonlyArray<string> {
  const headings: string[] = [];
  HEADING.lastIndex = 0;
  for (const match of markdown.matchAll(HEADING)) {
    const text = match[2]?.replace(/[#*`]/g, "").trim();
    if (text) headings.push(text);
  }
  return headings;
}

export function stripHandbookFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}
