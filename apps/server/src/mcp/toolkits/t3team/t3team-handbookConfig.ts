/** NX developer handbook on GHE — read by the host `t3-code` MCP handbook tools. */

export const HANDBOOK_HOST = "nexplore.ghe.com";
export const HANDBOOK_REPOSITORY = "hive/nx-developer-handbook";
export const HANDBOOK_DOCS_BASE_URL = "https://docs.nexplore.dev";
export const HANDBOOK_DOCS_ROOT = "Source/docs";
export const HANDBOOK_INDEX_PATH = "Source/src/pages/index.md";
export const HANDBOOK_CACHE_TTL_MS = 10 * 60 * 1_000;
export const HANDBOOK_DEFAULT_SEARCH_LIMIT = 8;
export const HANDBOOK_MAX_SEARCH_LIMIT = 25;
export const HANDBOOK_MARKDOWN_EXTENSIONS = [".md", ".mdx"] as const;
