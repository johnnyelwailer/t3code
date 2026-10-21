const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);

/** Word error rate: word-level Levenshtein distance over the reference length. */
export function computeWer(reference: string, hypothesis: string): number {
  const expected = tokenize(reference);
  const actual = tokenize(hypothesis);
  if (expected.length === 0) return actual.length === 0 ? 0 : 1;

  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  expected.forEach((word, row) => {
    const current = [row + 1];
    actual.forEach((candidate, column) => {
      current.push(
        Math.min(
          (previous[column + 1] ?? 0) + 1,
          (current[column] ?? 0) + 1,
          (previous[column] ?? 0) + (word === candidate ? 0 : 1),
        ),
      );
    });
    previous = current;
  });
  return (previous[actual.length] ?? 0) / expected.length;
}
