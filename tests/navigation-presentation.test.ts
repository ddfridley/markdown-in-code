import { expect, it } from 'vitest';
import { RenderingSession } from '../src/rendering';
import { extractComments } from '../src/comments';

const source = 'const outside=1;\n/*\n[First](https://example.com)\n*/\n/*\n[Second](https://example.org)\n*/';
const first = extractComments(source)[0];
const caret = (text: string) => [{ start: source.indexOf(text), end: source.indexOf(text) }];

it('keeps a navigated comment rendered even when a passive caret lands inside it', () => {
  const session = new RenderingSession();
  const pin = { start: first.start, end: first.end, version: 1 };
  const result = session.presentation('source', 1, 'source.ts', () => source, caret('First'), 4, pin);
  expect(result.decorations.filter(value => value.style === 'link').map(value => source.slice(value.start, value.end))).toEqual(['First', 'Second']);
  expect(result.boxes.some(value => value.region.start === first.start)).toBe(true);
});

it('does not protect other comments or another split/editor presentation', () => {
  const session = new RenderingSession();
  const pin = { start: first.start, end: first.end, version: 1 };
  const active = [...caret('First'), ...caret('Second')];
  const pinned = session.presentation('source', 1, 'source.ts', () => source, active, 4, pin);
  expect(pinned.decorations.filter(value => value.style === 'link').map(value => source.slice(value.start, value.end))).toEqual(['First']);
  const ordinary = session.presentation('source', 1, 'source.ts', () => source, caret('First'));
  expect(ordinary.decorations.filter(value => value.style === 'link').map(value => source.slice(value.start, value.end))).toEqual(['Second']);
});

it('stops protecting changed versions and still respects the global toggle', () => {
  const session = new RenderingSession();
  const pin = { start: first.start, end: first.end, version: 1 };
  const changed = session.presentation('source', 2, 'source.ts', () => source, caret('First'), 4, pin);
  expect(changed.decorations.filter(value => value.style === 'link').map(value => source.slice(value.start, value.end))).toEqual(['Second']);
  session.toggle();
  expect(session.presentation('source', 1, 'source.ts', () => source, caret('First'), 4, pin)).toEqual({ decorations: [], boxes: [] });
});
