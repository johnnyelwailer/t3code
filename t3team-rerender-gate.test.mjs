import { describe, expect, it } from 'vitest';

import {
  evaluateRerenderGate,
  interactiveComponentReasons,
  readExemption,
  renderGateReport,
  rerenderTestPath,
} from './t3team-rerender-gate.mjs';

const ROW_COMPONENT = 'export function Row() { const [open, setOpen] = useState(false); return null; }';
const LIST_COMPONENT =
  'export function List({ items }) { return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>; }';
const STORE_COMPONENT = 'export function Badge() { const value = useAtomValue(countAtom); return <b>{value}</b>; }';
const PLAIN_COMPONENT = 'export function Plain() { return <i>static</i>; }';

function makeRun(files) {
  const content = new Map(Object.entries(files));
  return (changedFiles, prBody = '') =>
    evaluateRerenderGate({
      changedFiles,
      prBody,
      readFile: (path) => (content.has(path) ? content.get(path) : null),
    });
}

describe('interactive component detection', () => {
  it('flags a component that holds local state', () => {
    expect(interactiveComponentReasons('apps/web/src/components/Row.tsx', ROW_COMPONENT)).toEqual(['state']);
  });

  it('flags a component that renders a list', () => {
    expect(interactiveComponentReasons('apps/web/src/components/List.tsx', LIST_COMPONENT)).toEqual(['list']);
  });

  it('flags a component that subscribes to a store', () => {
    expect(interactiveComponentReasons('apps/web/src/components/Badge.tsx', STORE_COMPONENT)).toEqual(['store']);
  });

  it('does not flag a plain presentational component', () => {
    expect(interactiveComponentReasons('apps/web/src/components/Plain.tsx', PLAIN_COMPONENT)).toEqual([]);
  });

  it('ignores files outside apps/web/src', () => {
    expect(interactiveComponentReasons('apps/server/src/http.ts', ROW_COMPONENT)).toEqual([]);
  });

  it('ignores tests, specs, and stories', () => {
    expect(interactiveComponentReasons('apps/web/src/components/Row.test.tsx', ROW_COMPONENT)).toEqual([]);
    expect(interactiveComponentReasons('apps/web/src/components/Row.spec.tsx', ROW_COMPONENT)).toEqual([]);
    expect(interactiveComponentReasons('apps/web/src/components/Row.stories.tsx', ROW_COMPONENT)).toEqual([]);
  });

  it('ignores the shared design system directory', () => {
    expect(interactiveComponentReasons('apps/web/src/components/ui/Row.tsx', ROW_COMPONENT)).toEqual([]);
  });
});

describe('sibling rerender test requirement', () => {
  it('passes when a sibling rerender test uses the shared helper', () => {
    const run = makeRun({
      'apps/web/src/components/Row.tsx': ROW_COMPONENT,
      'apps/web/src/components/Row.rerender.test.tsx': 'import { renderCounter } from "~/test/t3team-renderCounter";',
    });
    expect(run(['apps/web/src/components/Row.tsx']).pass).toBe(true);
  });

  it('fails when the flagged component has no rerender test', () => {
    const result = makeRun({ 'apps/web/src/components/Row.tsx': ROW_COMPONENT })(['apps/web/src/components/Row.tsx']);
    expect(result.pass).toBe(false);
    expect(result.missing.map((entry) => entry.file)).toEqual(['apps/web/src/components/Row.tsx']);
  });

  it('fails when the sibling test does not use the shared helper', () => {
    const run = makeRun({
      'apps/web/src/components/Row.tsx': ROW_COMPONENT,
      'apps/web/src/components/Row.rerender.test.tsx': 'const counts = new Map();',
    });
    expect(run(['apps/web/src/components/Row.tsx']).pass).toBe(false);
  });

  it('leaves unflagged components untouched', () => {
    const run = makeRun({ 'apps/web/src/components/Plain.tsx': PLAIN_COMPONENT });
    const result = run(['apps/web/src/components/Plain.tsx']);
    expect(result.pass).toBe(true);
    expect(result.flagged).toEqual([]);
  });

  it('derives the sibling test path from the component path', () => {
    expect(rerenderTestPath('apps/web/src/t3team/components/t3team-Row.tsx')).toBe(
      'apps/web/src/t3team/components/t3team-Row.rerender.test.tsx',
    );
  });
});

describe('PR body exemption line', () => {
  const run = makeRun({ 'apps/web/src/components/Row.tsx': ROW_COMPONENT });
  const files = ['apps/web/src/components/Row.tsx'];

  it('accepts a two-word-or-more reason', () => {
    const result = run(files, '## Evidence\nRerender: n/a, static menu with no shared state');
    expect(result.pass).toBe(true);
    expect(result.exemption.valid).toBe(true);
  });

  it('rejects a one-word reason', () => {
    expect(run(files, 'Rerender: n/a, none').pass).toBe(false);
  });

  it('rejects a missing reason', () => {
    expect(run(files, 'Rerender: n/a').pass).toBe(false);
  });

  it('rejects a line that does not match the format', () => {
    expect(run(files, 'Rerender: skipped').pass).toBe(false);
  });

  it('reads the exemption from anywhere in the body', () => {
    expect(readExemption('some prose\n\nRerender: n/a, list is virtualized and memoized').valid).toBe(true);
    expect(readExemption('nothing here').present).toBe(false);
  });
});

describe('gate report', () => {
  const run = makeRun({ 'apps/web/src/components/Row.tsx': ROW_COMPONENT });
  const result = run(['apps/web/src/components/Row.tsx']);

  it('lists the failing component, its test path, and the exemption format', () => {
    const report = renderGateReport(result).join('\n');
    expect(report).toContain('rerender gate: FAIL');
    expect(report).toContain('apps/web/src/components/Row.rerender.test.tsx');
    expect(report).toContain('Rerender: n/a, <reason naming what cannot re-render wrongly>');
  });

  it('reports PASS when nothing is gated', () => {
    const empty = evaluateRerenderGate({ changedFiles: [], prBody: '', readFile: () => null });
    expect(renderGateReport(empty)).toEqual(['rerender gate: PASS']);
  });
});
