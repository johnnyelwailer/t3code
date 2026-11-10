/** Field-weighted Okapi BM25 over handbook pages (title, headings, path, body). */

const TOKEN = /[a-z0-9]+(?:'[a-z0-9]+)?/gi;
const K1 = 1.2;
const B = 0.75;

const FIELD_WEIGHTS = {
  title: 4,
  headings: 2.5,
  path: 2,
  body: 1,
} as const;

export interface HandbookSearchDocument {
  readonly path: string;
  readonly title: string;
  readonly headings: ReadonlyArray<string>;
  readonly body: string;
}

export interface HandbookRankedHit {
  readonly path: string;
  readonly title: string;
  readonly score: number;
}

export function tokenizeHandbookText(text: string): ReadonlyArray<string> {
  return (text.toLowerCase().match(TOKEN) ?? []).filter((token) => token.length > 1);
}

function fieldTokens(doc: HandbookSearchDocument): {
  readonly title: ReadonlyArray<string>;
  readonly headings: ReadonlyArray<string>;
  readonly path: ReadonlyArray<string>;
  readonly body: ReadonlyArray<string>;
} {
  return {
    title: tokenizeHandbookText(doc.title),
    headings: tokenizeHandbookText(doc.headings.join(" ")),
    path: tokenizeHandbookText(doc.path.replaceAll(/[/.]/g, " ")),
    body: tokenizeHandbookText(doc.body),
  };
}

function termFrequency(tokens: ReadonlyArray<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

function idf(documentFrequency: number, documentCount: number): number {
  return Math.log(1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5));
}

function bm25Field(
  queryTerms: ReadonlyArray<string>,
  fieldTf: Map<string, number>,
  fieldLength: number,
  avgFieldLength: number,
  documentFrequency: Map<string, number>,
  documentCount: number,
  weight: number,
): number {
  if (fieldLength === 0 || avgFieldLength === 0) return 0;
  let score = 0;
  for (const term of queryTerms) {
    const frequency = fieldTf.get(term) ?? 0;
    if (frequency === 0) continue;
    const termIdf = idf(documentFrequency.get(term) ?? 0, documentCount);
    const denom = frequency + K1 * (1 - B + B * (fieldLength / avgFieldLength));
    score += weight * termIdf * ((frequency * (K1 + 1)) / denom);
  }
  return score;
}

/** Rank handbook pages for `query`; higher score first. Empty query yields no hits. */
export function rankHandbookDocuments(
  query: string,
  documents: ReadonlyArray<HandbookSearchDocument>,
  limit: number,
): ReadonlyArray<HandbookRankedHit> {
  const queryTerms = [...new Set(tokenizeHandbookText(query))];
  if (queryTerms.length === 0 || documents.length === 0 || limit <= 0) return [];

  const fields = documents.map(fieldTokens);
  const documentCount = documents.length;
  const avg = {
    title: 0,
    headings: 0,
    path: 0,
    body: 0,
  };
  const df = {
    title: new Map<string, number>(),
    headings: new Map<string, number>(),
    path: new Map<string, number>(),
    body: new Map<string, number>(),
  };

  for (const field of fields) {
    avg.title += field.title.length;
    avg.headings += field.headings.length;
    avg.path += field.path.length;
    avg.body += field.body.length;
    for (const [name, tokens] of Object.entries(field) as Array<
      [keyof typeof df, ReadonlyArray<string>]
    >) {
      for (const term of new Set(tokens)) {
        df[name].set(term, (df[name].get(term) ?? 0) + 1);
      }
    }
  }
  avg.title /= documentCount;
  avg.headings /= documentCount;
  avg.path /= documentCount;
  avg.body /= documentCount;

  const scored = documents.map((doc, index) => {
    const field = fields[index]!;
    const score =
      bm25Field(
        queryTerms,
        termFrequency(field.title),
        field.title.length,
        avg.title,
        df.title,
        documentCount,
        FIELD_WEIGHTS.title,
      ) +
      bm25Field(
        queryTerms,
        termFrequency(field.headings),
        field.headings.length,
        avg.headings,
        df.headings,
        documentCount,
        FIELD_WEIGHTS.headings,
      ) +
      bm25Field(
        queryTerms,
        termFrequency(field.path),
        field.path.length,
        avg.path,
        df.path,
        documentCount,
        FIELD_WEIGHTS.path,
      ) +
      bm25Field(
        queryTerms,
        termFrequency(field.body),
        field.body.length,
        avg.body,
        df.body,
        documentCount,
        FIELD_WEIGHTS.body,
      );
    return { path: doc.path, title: doc.title, score };
  });

  return scored
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, limit);
}
