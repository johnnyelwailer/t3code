// @effect-diagnostics nodeBuiltinImport:off - this registry does plain
// filesystem I/O (frontmatter parsing, path containment) by design.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { ResolvedPrompt } from "@runbook/core/authoring";

/**
 * Prompt registry: prompts are files under `<promptsDir>/<id>.md` with
 * YAML-ish frontmatter (id, version, locBudget) + a body. This module does
 * the plain filesystem/parsing work — callers decide when it is safe to do
 * this I/O (e.g. from inside a durable-runtime activity, never directly
 * from replayable workflow code).
 *
 * `id` may contain slashes (e.g. "code-pr-review/main") and maps directly to
 * a nested path (`<promptsDir>/code-pr-review/main.md`).
 */

export interface PromptFrontmatter {
  id: string;
  version: string;
  locBudget: number;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontmatter(
  raw: string,
  sourcePath: string,
): { meta: PromptFrontmatter; body: string } {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error(
      `prompt registry: ${sourcePath} is missing YAML-ish frontmatter (expected a leading "---" block)`,
    );
  }
  const [, frontmatterBlock = "", rest = ""] = match;
  const meta: Partial<PromptFrontmatter> = {};

  for (const line of frontmatterBlock.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sepIndex = trimmed.indexOf(":");
    if (sepIndex === -1) {
      throw new Error(
        `prompt registry: ${sourcePath} has an unparseable frontmatter line: "${line}"`,
      );
    }
    const key = trimmed.slice(0, sepIndex).trim();
    const value = trimmed.slice(sepIndex + 1).trim();
    if (key === "id" || key === "version") {
      meta[key] = value;
    } else if (key === "locBudget") {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`prompt registry: ${sourcePath} has an invalid locBudget: "${value}"`);
      }
      meta.locBudget = n;
    }
    // Unknown frontmatter keys are ignored — forward-compatible with future
    // fields (layer, slots, refs) the cascade may add.
  }

  if (!meta.id || !meta.version || meta.locBudget === undefined) {
    throw new Error(
      `prompt registry: ${sourcePath} frontmatter must define id, version, and locBudget`,
    );
  }

  return { meta: meta as PromptFrontmatter, body: rest.replace(/^\r?\n/, "") };
}

function countLoc(body: string): number {
  // Split on CR, LF and CRLF alike: a file with bare-CR line endings would
  // otherwise count as one line and slip past its locBudget entirely.
  return body.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0).length;
}

/**
 * A prompt id addresses a file *inside* the prompts tree and nothing else.
 * Ids commonly reach here from runbook code, and a project-layer runbook
 * may be authored by any team with write access to their own repo — so an
 * id is untrusted input, not a constant. Without this,
 * `ctx.prompt('../../..'.repeat(n) + 'etc/passwd')` reads arbitrary files in
 * whatever host process resolves prompts, which can be a process holding
 * sensitive credentials.
 */
const PROMPT_ID_RE = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/i;

/**
 * Shared containment check: resolves `<id><extension>` inside `dir` and
 * throws unless the result stays inside `dir`. Used for both the `.md` body
 * file (via {@link promptPathWithin}) and the cascade's `.slots.json` delta
 * file (via {@link slotsPathWithin}) — one guard, two extensions, so the
 * cascade's slot lookups get exactly the same traversal protection as the
 * existing prompt-body lookups instead of a parallel, possibly-weaker copy.
 */
function resolveFileWithin(dir: string, id: string, extension: string): string {
  if (!PROMPT_ID_RE.test(id)) {
    throw new Error(
      `prompt registry: invalid prompt id "${id}" — ids are slash-separated names, no "..", absolute paths or backslashes`,
    );
  }
  const rootReal = realpathSync(dir);
  const filePath = path.resolve(rootReal, `${id}${extension}`);
  // Belt to the charset braces: containment is checked on the resolved path,
  // so a future id-charset change cannot silently reopen the escape.
  const rel = path.relative(rootReal, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`prompt registry: prompt id "${id}" resolves outside the prompts directory`);
  }
  return filePath;
}

function promptPathWithin(promptsDir: string, id: string): string {
  return resolveFileWithin(promptsDir, id, ".md");
}

/**
 * Same containment guard as {@link promptPathWithin}, addressing a prompt's
 * sibling `<id>.slots.json` delta-override file (cascade "overrides as
 * deltas, not copies" — see resolvePromptCascade.ts). Exported so the
 * cascade module never has to re-derive its own path-joining logic.
 */
export function slotsPathWithin(promptsDir: string, id: string): string {
  return resolveFileWithin(promptsDir, id, ".slots.json");
}

/**
 * Loads and validates a single prompt file at an exact path. Throws with a
 * clear message if the body exceeds its declared locBudget — enforcement
 * happens at LOAD time, not lazily.
 */
export function loadPromptFile(filePath: string, expectedId?: string): ResolvedPrompt {
  const raw = readFileSync(filePath, "utf8");
  const { meta, body } = parseFrontmatter(raw, filePath);

  // The returned id feeds provenance records (promptsUsed) and cascade
  // lookups, so a file whose frontmatter claims a different identity than
  // the id it was resolved under must be rejected, not passed through.
  if (expectedId !== undefined && meta.id !== expectedId) {
    throw new Error(
      `prompt registry: file resolved for id "${expectedId}" declares id "${meta.id}" (${filePath})`,
    );
  }

  const loc = countLoc(body);
  if (loc > meta.locBudget) {
    throw new Error(
      `prompt registry: "${meta.id}" body is ${loc} LOC, over its locBudget of ${meta.locBudget} (${filePath})`,
    );
  }

  const hash = createHash("sha256").update(body, "utf8").digest("hex");
  return { id: meta.id, version: meta.version, locBudget: meta.locBudget, hash, body };
}

/**
 * Resolves a prompt id (e.g. "code-pr-review/main") to its file under
 * `promptsDir` and loads it. Unknown ids throw a clear error.
 */
export function resolvePrompt(id: string, promptsDir: string): ResolvedPrompt {
  const filePath = promptPathWithin(promptsDir, id);
  try {
    // A symlink inside the tree pointing out of it is still an escape, so the
    // final target is re-checked after resolution.
    const targetReal = realpathSync(filePath);
    const rootReal = realpathSync(promptsDir);
    const rel = path.relative(rootReal, targetReal);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`prompt registry: prompt "${id}" is a symlink leaving the prompts directory`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
    // Missing file falls through to the ENOENT message below.
  }
  try {
    return loadPromptFile(filePath, id);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`prompt registry: unknown prompt id "${id}" (expected file at ${filePath})`);
    }
    throw err;
  }
}

/** A prompt body loaded from a specific layer directory, plus the path it came from. */
export interface PromptLookupResult {
  prompt: ResolvedPrompt;
  filePath: string;
}

/**
 * Cascade-flavored sibling of {@link resolvePrompt}: looks up `id` under
 * `promptsDir` through the exact same containment guard, but treats "not
 * present in this directory" as a normal, silent miss (`undefined`) instead
 * of throwing — the cascade walks several layer directories for the same id
 * and only the *last* one (across every configured layer) not having it is
 * an error. A missing/nonexistent `promptsDir` itself (an unconfigured or
 * not-yet-checked-out layer) is likewise a silent miss.
 *
 * Anything that indicates a real problem rather than "not here" — an
 * invalid id, a traversal/symlink escape, a malformed frontmatter block, or
 * an over-locBudget body — still throws exactly as {@link resolvePrompt}
 * does. Weakening those into silent misses would let a project layer's
 * traversal attempt masquerade as "id not found in this layer" and quietly
 * fall through to the next one.
 */
export function tryResolvePrompt(id: string, promptsDir: string): PromptLookupResult | undefined {
  if (!existsSync(promptsDir)) {
    return undefined;
  }
  const filePath = promptPathWithin(promptsDir, id);
  try {
    // A symlink inside the tree pointing out of it is still an escape, so the
    // final target is re-checked after resolution (mirrors resolvePrompt).
    const targetReal = realpathSync(filePath);
    const rootReal = realpathSync(promptsDir);
    const rel = path.relative(rootReal, targetReal);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`prompt registry: prompt "${id}" is a symlink leaving the prompts directory`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
  try {
    return { prompt: loadPromptFile(filePath, id), filePath };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
}
