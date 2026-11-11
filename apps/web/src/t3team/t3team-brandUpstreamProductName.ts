/**
 * Diagnosis and other upstream copy still says "T3 Code". In a Nexi Work (or other pack)
 * distribution, replace that product name and leave "T3 Connect" alone — it is a different
 * product, and the letters "T3 Code" do not appear inside it.
 */
export function brandUpstreamProductName(text: string, productName: string): string {
  if (productName === "" || productName === "T3 Code") return text;
  return text.replaceAll("T3 Code", productName);
}
