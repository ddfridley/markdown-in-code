import { expect, it } from 'vitest';
import { parseComments } from '../src/markdown';
import { RenderingSession } from '../src/rendering';
import { commentText } from '../src/comment-text';

for (const eol of ['\n', '\r\n']) it(`maps explicit nested quote markers and leaves lazy rows alone with ${JSON.stringify(eol)}`, () => {
  const source = ['const outside=1;', '/**', ' * > **Parent**', ' * > > Nested', ' * > > Another', ' * >', ' * > Paragraph', ' * lazy continuation', ' */'].join(eol);
  const decorations = parseComments(source);
  const quotes = decorations.filter(d => d.style === 'quoteMarker');
  expect(quotes).toHaveLength(7);
  expect(quotes.map(d => source.slice(d.start, d.end))).toEqual(Array(7).fill('>'));
  expect(new Set(quotes.map(d => d.start)).size).toBe(7);
  expect(decorations.filter(d => d.style === 'strong').map(d => source.slice(d.start, d.end))).toEqual(['Parent']);
  for (const quote of quotes) expect(decorations.filter(d => d.style !== 'quoteMarker' && d.style !== 'codeBackground').every(d => d.end <= quote.start || d.start >= quote.end)).toBe(true);
});

it('preserves headings, lists, tasks, rules and token colors inside nested quotes', () => {
  const source = '/*\n> # Title\n>\n> - Bullet\n> - [x] Task\n>\n> ---\n>\n> > ```ts\n> > const answer = 42;\n> > ```\n*/';
  const decorations = parseComments(source);
  const text = (style: string) => decorations.filter(d => d.style === style).map(d => source.slice(d.start, d.end));
  expect(text('heading')).toEqual(['Title']);
  expect(text('listMarker')).toEqual(['-']);
  expect(text('taskMarker')).toEqual(['-']);
  expect(text('horizontalRule')).toEqual(['---']);
  expect(text('codeFence')).toEqual(['```ts', '```']);
  expect(text('codeKeyword')).toEqual(['const']);
  expect(text('codeNumber')).toEqual(['42']);
  expect(text('codeText').join('')).not.toContain('>');
  expect(decorations.filter(d => d.style.startsWith('code')).every(d => d.region === decorations[0].region)).toBe(true);
});

it('only replaces actual quote markers, including list-contained and grouped quotes', () => {
  for (const source of ['/*\n```md\n> Code\n```\n*/', '/*\n    > Indented code\n*/', '/*\n<!--\n> HTML\n-->\n*/', '/*\n\\> Escaped\n*/', '/* > Inline */', '// > Lone', 'const x=1; // > Trailing']) expect(parseComments(source).filter(d => d.style === 'quoteMarker'), source).toEqual([]);
  expect(parseComments('// > First\n// > Second').filter(d => d.style === 'quoteMarker')).toHaveLength(2);
  expect(parseComments('/*\n- > First\n  > Next\n*/').filter(d => d.style === 'quoteMarker')).toHaveLength(2);
  const code = '/*\n> ```md\n> > literal greater-than inside code\n> ```\n*/';
  expect(parseComments(code).filter(d => d.style === 'quoteMarker')).toHaveLength(3);
  expect(parseComments(code).filter(d => d.style === 'codeText').map(d => code.slice(d.start, d.end)).join('')).toContain('> literal');
});

it('keeps Setext bars visible and restores source on selection/toggle', () => {
  const source = 'const outside=1;\n/*\n> Underlined title\n> ===\n*/';
  const session = new RenderingSession();
  const render = (position: number) => session.presentation('quotes', 1, 'quotes.ts', () => source, [{ start: position, end: position }]);
  const { decorations, boxes } = render(0);
  const bars = decorations.filter(d => d.style === 'quoteMarker');
  expect(bars).toHaveLength(2);
  expect(decorations.filter(d => d.style === 'heading').map(d => source.slice(d.start, d.end))).toEqual(['Underlined title']);
  for (const bar of bars) expect(commentText(boxes, decorations).every(d => d.end <= bar.start || d.start >= bar.end)).toBe(true);
  expect(render(source.indexOf('title')).decorations).toEqual([]);
  expect(render(0).decorations).toEqual(decorations);
  session.toggle();
  expect(render(0).decorations).toEqual([]);
});
