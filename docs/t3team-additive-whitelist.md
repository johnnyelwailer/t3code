# Additive guard: pending whitelist entries

Status: **awaits owner approval**. Nothing here is in `.t3team-additive-guard.json`.

| File                                                         | Why it must change                                                                                                                               | Why not extracted                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/project-context/src/t3teamProjectStateDir.ts`      | Owns the one state dir constant (`.nexi` becomes `.agents/nexi`), the `.nexi` segment in the physical-path regex, and the Windows separator fix. | The constant is the single owner; moving it would create a second one. The file has no `t3team-` prefix, so the guard counts it as upstream. |
| `packages/project-context/src/t3teamProjectStateDir.test.ts` | Its default-dir assertion names the old dir.                                                                                                     | A test of the constant stays beside it.                                                                                                      |

Everything else new lives in prefixed files: `t3team-projectStateLayout.ts` (read dirs, path
detection), `t3team-projectStateContainment.ts` (the writer guard), `t3team-projectStateReadRoots.ts`.

Alternative to two entries: rename both files with a `t3team-` prefix (about 35 import sites).

## Review notes for `.agents/nexi/`

- `.agents/nexi/` holds executable recipes and the machine definition: it needs the same
  CODEOWNERS as `.nexi/`.
- When both exist, the new dir wins silently for triggers and machine source.
  Recipes and `machine.json` report the shadowing.
