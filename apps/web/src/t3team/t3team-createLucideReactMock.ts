export async function createLucideReactMock(importOriginal: <T>() => Promise<T>) {
  const actual = await importOriginal<typeof import("lucide-react")>();

  return Object.fromEntries(
    Object.keys(actual).map((name) => [name, name === "__esModule" ? true : () => null]),
  );
}
