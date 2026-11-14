export function selectedQuoteText(body: Element | null, fullText: string): string {
  if (body === null) return fullText;
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return fullText;
  const range = selection.getRangeAt(0);
  if (!body.contains(range.startContainer) || !body.contains(range.endContainer)) return fullText;
  const selected = range.toString();
  return selected.trim().length > 0 ? selected : fullText;
}
