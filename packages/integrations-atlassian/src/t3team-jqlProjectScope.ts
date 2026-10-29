/**
 * Fail-closed JQL scoping for agent-facing reads.
 *
 * Strategy: a CONJUNCTIVE REWRITE. `Q ORDER BY o` becomes `(Q) AND project in (<id>) ORDER BY o`,
 * so whatever Q selects, the result is a subset of the bound project; no JQL semantics (functions,
 * sub-queries, `OR project = OTHER`) have to be understood. The only thing parsed is STRUCTURE:
 * where the top-level ORDER BY starts, and whether quotes and parentheses balance. A query whose
 * structure cannot be read with confidence is refused, never repaired: unbalanced quotes would put
 * the appended clause inside a string literal, and `a) OR project = X OR (b` would close the
 * wrapping parenthesis early.
 *
 * Absent or blank JQL is not "no filter" (to Jira it selects every issue the account can see); it
 * becomes the project clause itself.
 */

export type JqlScopeResult =
  | { readonly ok: true; readonly jql: string }
  | { readonly ok: false; readonly reason: string };

const MAX_JQL_LENGTH = 4096;
const FIELD = String.raw`(?:[A-Za-z0-9_.]+|cf\[\d+\]|"[^"\\]*"|'[^'\\]*')`;
const ORDER_BY_TAIL = new RegExp(
  `^ORDER\\s+BY\\s+${FIELD}(?:\\s+(?:ASC|DESC))?(?:\\s*,\\s*${FIELD}(?:\\s+(?:ASC|DESC))?)*$`,
  "i",
);

const isControl = (code: number): boolean => code < 0x20 || code === 0x7f;
const isTokenBoundary = (text: string, index: number): boolean =>
  index < 0 || /[\s)]/.test(text[index] ?? "");

type Scan =
  | { readonly ok: true; readonly orderByAt: number | null }
  | { readonly ok: false; readonly reason: string };

/** One pass over the raw query: do quotes and parens balance, and where does ORDER BY start. */
function scanJql(text: string): Scan {
  let depth = 0;
  let orderByAt: number | null = null;
  let index = 0;
  while (index < text.length) {
    const char = text[index] ?? "";
    const code = char.codePointAt(0) ?? 0;
    if (isControl(code)) return { ok: false, reason: "control character" };
    if (char === '"' || char === "'") {
      index += 1;
      let closed = false;
      while (index < text.length) {
        const inner = text[index] ?? "";
        if (isControl(inner.codePointAt(0) ?? 0)) return { ok: false, reason: "control character" };
        // A backslash escapes the next character in Jira's lexer too, so both views agree on
        // where a string ends.
        if (inner === "\\") {
          index += 2;
          continue;
        }
        index += 1;
        if (inner === char) {
          closed = true;
          break;
        }
      }
      if (!closed) return { ok: false, reason: "unterminated string" };
      continue;
    }
    // Structure is ASCII: a homoglyph such as a fullwidth `ｐroject` would hide it from this scan.
    if (code > 0x7e) return { ok: false, reason: "non-ASCII character outside a string" };
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth < 0) return { ok: false, reason: "unbalanced parenthesis" };
    }
    if (
      (char === "o" || char === "O") &&
      isTokenBoundary(text, index - 1) &&
      /^order\s+by\b/i.test(text.slice(index, index + 64))
    ) {
      if (depth !== 0) return { ok: false, reason: "nested ORDER BY" };
      if (orderByAt === null) orderByAt = index;
    }
    index += 1;
  }
  return depth === 0 ? { ok: true, orderByAt } : { ok: false, reason: "unbalanced parenthesis" };
}

/** The numeric Jira project id as the only accepted binding shape: it is interpolated into JQL. */
export function isJqlProjectId(value: string): boolean {
  return /^[0-9]{1,19}$/.test(value);
}

/**
 * `raw` narrowed to the project, or a refusal reason. `raw` is untrusted; the id is validated too.
 * `narrowing` is host-built JQL (see {@link buildWorkItemFilterJql}) ANDed in before the project
 * clause; it is trusted only because every value in it went through {@link quoteJqlString}.
 */
export function restrictJqlToProject(
  raw: string | null | undefined,
  externalProjectId: string,
  narrowing?: string,
): JqlScopeResult {
  if (!isJqlProjectId(externalProjectId)) return { ok: false, reason: "unsupported project id" };
  const clause = `project in (${externalProjectId})`;
  const source = raw ?? "";
  if (source.length > MAX_JQL_LENGTH) return { ok: false, reason: "JQL too long" };
  const scan =
    source.trim().length === 0 ? { ok: true as const, orderByAt: null } : scanJql(source);
  if (!scan.ok) return scan;
  const body = (scan.orderByAt === null ? source : source.slice(0, scan.orderByAt)).trim();
  const tail = scan.orderByAt === null ? "" : source.slice(scan.orderByAt).trim();
  if (tail.length > 0 && !ORDER_BY_TAIL.test(tail)) return { ok: false, reason: "unsafe ORDER BY" };
  const conjuncts = [body, narrowing?.trim() ?? ""].filter((part) => part.length > 0);
  const scoped = [...conjuncts.map((part) => `(${part})`), clause].join(" AND ");
  return { ok: true, jql: tail.length > 0 ? `${scoped} ${tail}` : scoped };
}

/** A JQL string literal for `value`; null when it holds a character the scan above refuses. */
export function quoteJqlString(value: string): string | null {
  for (const char of value) if (isControl(char.codePointAt(0) ?? 0)) return null;
  return `"${value.replace(/[\\"]/g, (match) => `\\${match}`)}"`;
}

export interface WorkItemJqlFilters {
  readonly status?: ReadonlyArray<string> | undefined;
  readonly assignee?: string | undefined;
  readonly labels?: ReadonlyArray<string> | undefined;
  readonly type?: string | undefined;
  readonly sprint?: string | undefined;
  readonly text?: string | undefined;
}

/** Jira's `text ~` is a full-text term: quotes and backslashes are stripped, not escaped. */
const toTextTerm = (text: string): string =>
  text.replace(/[\\"]/g, " ").replace(/\s+/g, " ").trim();

/** The structured filters as one JQL body (ANDed clauses); null when a value cannot be quoted. */
export function buildWorkItemFilterJql(filters: WorkItemJqlFilters): string | null {
  const clauses: Array<string | null> = [];
  const equals = (field: string, op: "=" | "~", value: string) => {
    const literal = quoteJqlString(value);
    clauses.push(literal === null ? null : `${field} ${op} ${literal}`);
  };
  if (filters.status !== undefined && filters.status.length > 0) {
    const literals = filters.status.map(quoteJqlString);
    clauses.push(
      literals.every((literal) => literal !== null) ? `status in (${literals.join(", ")})` : null,
    );
  }
  if (filters.type !== undefined) equals("issuetype", "=", filters.type);
  if (filters.sprint !== undefined) equals("sprint", "=", filters.sprint);
  if (filters.text !== undefined && toTextTerm(filters.text).length > 0) {
    equals("text", "~", toTextTerm(filters.text));
  }
  for (const label of filters.labels ?? []) equals("labels", "=", label);
  if (filters.assignee !== undefined) {
    if (filters.assignee.toLowerCase() === "unassigned") clauses.push("assignee is EMPTY");
    else equals("assignee", "=", filters.assignee);
  }
  return clauses.every((clause) => clause !== null) ? clauses.join(" AND ") : null;
}
