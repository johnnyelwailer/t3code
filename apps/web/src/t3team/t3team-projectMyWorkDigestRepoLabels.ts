/**
 * Short repository names for the digest's PR chips. Every chip naming `hive/ies-sanitaet`,
 * `hive/ies-alarm`, `hive/ies-base-libs` repeats `hive/ies-`; the part after the prefix all of
 * them share is what tells them apart. Computed once per digest so a repo reads the same on
 * every row.
 */
export function digestRepoLabeler(repos: readonly string[]): (repo: string) => string {
  const unique = [...new Set(repos)];
  if (unique.length === 0) return (repo) => repo;
  let prefix = unique[0] ?? "";
  for (const repo of unique.slice(1)) {
    while (prefix !== "" && !repo.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  // Cut only at a separator, so `hive/ies-base-libs` and `hive/ies-base-config` keep `base-…`
  // only when every repo shares it, and a partial word is never chopped.
  const cut = Math.max(prefix.lastIndexOf("/"), prefix.lastIndexOf("-"), prefix.lastIndexOf("_"));
  const strip = cut >= 0 ? prefix.slice(0, cut + 1) : "";
  return (repo) => {
    const label = strip !== "" && repo.startsWith(strip) ? repo.slice(strip.length) : repo;
    return label === "" ? repo : label;
  };
}
