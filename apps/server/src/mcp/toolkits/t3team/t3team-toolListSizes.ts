/**
 * What each MCP tool costs an agent that loads the whole `tools/list`: the bytes of
 * `{name, description, inputSchema}`, the same fields `AgentContextBudget.test.ts` measures, split
 * into the tool description, the field `description` strings inside the input schema, and the
 * rest of the schema. Pure functions over registered tools, so the budget test, the description
 * cap test and the size report share one definition of "bytes".
 */

export interface MeasuredTool {
  readonly name: string;
  readonly description?: string | undefined;
  readonly inputSchema: unknown;
}

export interface ToolSizeRow {
  readonly name: string;
  readonly owner: "fork" | "upstream";
  readonly totalBytes: number;
  readonly descriptionBytes: number;
  readonly fieldDescriptionBytes: number;
  readonly schemaStructureBytes: number;
}

const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every JSON-Schema `description` string. A property that is itself named "description" is a field, not docs. */
export function collectFieldDescriptions(schema: unknown): ReadonlyArray<string> {
  const found: Array<string> = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isObject(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "description" && typeof value === "string") found.push(value);
      else if (key === "properties" && isObject(value)) Object.values(value).forEach(visit);
      else visit(value);
    }
  };
  visit(schema);
  return found;
}

export function fieldDescriptionBytesOf(schema: unknown): number {
  return collectFieldDescriptions(schema).reduce(
    (sum, text) => sum + utf8Bytes(JSON.stringify(text)),
    0,
  );
}

export function measureToolListSizes(
  tools: ReadonlyArray<MeasuredTool>,
  forkToolNames: ReadonlySet<string>,
): ReadonlyArray<ToolSizeRow> {
  return tools
    .map((tool): ToolSizeRow => {
      const totalBytes = utf8Bytes(
        JSON.stringify({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }),
      );
      const descriptionBytes = utf8Bytes(JSON.stringify(tool.description ?? ""));
      const fieldDescriptionBytes = fieldDescriptionBytesOf(tool.inputSchema);
      return {
        name: tool.name,
        owner: forkToolNames.has(tool.name) ? "fork" : "upstream",
        totalBytes,
        descriptionBytes,
        fieldDescriptionBytes,
        schemaStructureBytes: Math.max(0, totalBytes - descriptionBytes - fieldDescriptionBytes),
      };
    })
    .toSorted((left, right) => right.totalBytes - left.totalBytes);
}

/** Bytes to tokens at the rule of thumb the context-budget discussion uses (about 4 bytes a token). */
export const estimateTokens = (bytes: number) => Math.round(bytes / 4);

export function formatToolSizeTable(rows: ReadonlyArray<ToolSizeRow>): string {
  const pad = (text: string | number, width: number) => String(text).padStart(width);
  const line = (row: ToolSizeRow) =>
    `${row.name.padEnd(34)} ${row.owner.padEnd(8)} ${pad(row.totalBytes, 6)} ${pad(row.descriptionBytes, 6)} ${pad(row.fieldDescriptionBytes, 6)} ${pad(row.schemaStructureBytes, 6)}`;
  const sum = (selected: ReadonlyArray<ToolSizeRow>) =>
    selected.reduce((total, row) => total + row.totalBytes, 0);
  const forkRows = rows.filter((row) => row.owner === "fork");
  const upstreamRows = rows.filter((row) => row.owner === "upstream");
  // JSON.stringify of the array adds one comma between entries and the two brackets.
  const listBytes = sum(rows) + Math.max(0, rows.length - 1) + 2;
  return [
    `${"tool".padEnd(34)} ${"owner".padEnd(8)} ${pad("total", 6)} ${pad("desc", 6)} ${pad("fields", 6)} ${pad("schema", 6)}`,
    ...rows.map(line),
    `fork ${forkRows.length} tools: ${sum(forkRows)} B (~${estimateTokens(sum(forkRows))} tokens)`,
    `upstream ${upstreamRows.length} tools: ${sum(upstreamRows)} B (~${estimateTokens(sum(upstreamRows))} tokens)`,
    `tools/list JSON: ${listBytes} B (~${estimateTokens(listBytes)} tokens)`,
  ].join("\n");
}
