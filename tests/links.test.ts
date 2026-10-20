import { expect, it } from 'vitest';
import { parseComments } from '../src/markdown';
import { resolveLink } from '../src/links';
import { RenderingSession } from '../src/rendering';
import { commentText } from '../src/comment-text';

for (const eol of ['\n', '\r\n']) it(`maps inline, reference and autolink labels with ${JSON.stringify(eol)}`, () => {
  const source = ['const outside=1;', '/**', ' * [**Bold** and *italic*](https://example.com "Title")', ' * <https://example.org> <a@example.com> https://example.net', ' * [Reference][ID] [id][] [id]', ' *', ' * [id]: ./target.ts "Reference title"', ' */'].join(eol);
  const decorations = parseComments(source);
  const links = decorations.filter(d => d.style === 'link');
  expect(links.map(d => source.slice(d.start, d.end))).toEqual(['**Bold** and *italic*', 'https://example.org', 'a@example.com', 'https://example.net', 'Reference', 'id', 'id', './target.ts']);
  expect(links.map(d => d.destination)).toEqual(['https://example.com', 'https://example.org', 'mailto:a@example.com', 'https://example.net', './target.ts', './target.ts', './target.ts', './target.ts']);
  expect(links[0].title).toBe('Title');
  expect(links[4].title).toBe('Reference title');
  expect(source.slice(links[0].activation!.start, links[0].activation!.end)).toBe('[**Bold** and *italic*](https://example.com "Title")');
  expect(decorations.filter(d => d.style === 'strong').map(d => source.slice(d.start, d.end))).toEqual(['Bold']);
});

it('uses the first definition and keeps definitions isolated to each comment', () => {
  const source = '/*\n[link][id]\n\n[id]: https://first.example\n[id]: https://second.example\n*/\n/*\n[unresolved][id]\n*/';
  const links = parseComments(source).filter(d => d.style === 'link');
  expect(links.filter(d => source.slice(d.start, d.end) === 'link').map(d => d.destination)).toEqual(['https://first.example']);
  expect(links.filter(d => source.slice(d.start, d.end).startsWith('https://')).map(d => d.destination)).toEqual(['https://first.example', 'https://second.example']);
});

it('keeps code, HTML, images and escaped syntax literal', () => {
  for (const source of ['/*\n```md\n[code](https://example.com)\n```\n*/', '/*\n    [code](https://example.com)\n*/', '/*\n<!--\n[html](https://example.com)\n-->\n*/', '/*\n![image](./image.png)\n*/', '/*\n\\[escaped](./target.ts)\n*/']) expect(parseComments(source).filter(d => d.style === 'link'), source).toEqual([]);
});

it('renders same-line block, lone and trailing line-comment links without changing code', () => {
  for (const source of ['/* [inline](./target.ts) */', '// [inline](./target.ts)', 'const outside=1; // [inline](./target.ts)']) {
    const links = parseComments(source).filter(d => d.style === 'link');
    expect(links.map(d => source.slice(d.start, d.end))).toEqual(['inline']);
    expect(links[0].destination).toBe('./target.ts');
    expect(links[0].start).toBeGreaterThanOrEqual(source.indexOf('['));
  }
});

it('supports multiline quoted links without covering bars, and restores source', () => {
  const source = 'const outside=1;\n/*\n> [first\n> second](./target.ts)\n*/';
  const session = new RenderingSession();
  const render = (position: number) => session.presentation('links', 1, 'links.ts', () => source, [{ start: position, end: position }]);
  const { decorations, boxes } = render(0);
  const links = decorations.filter(d => d.style === 'link');
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    expect(commentText(boxes, decorations).every(d => d.end <= link.start || d.start >= link.end)).toBe(true);
    expect(decorations.filter(d => d.style === 'quoteMarker').every(d => d.end <= link.start || d.start >= link.end)).toBe(true);
  }
  expect(render(source.indexOf('first')).decorations).toEqual([]);
  expect(render(0).decorations).toEqual(decorations);
  session.toggle();
  expect(render(0).decorations).toEqual([]);
});

it('resolves explicit external and local targets without executing other schemes', () => {
  const base = 'file:///C:/project/source.ts';
  expect(resolveLink('./target%20file.ts', base)).toEqual({ kind: 'editor', uri: 'file:///C:/project/target%20file.ts' });
  expect(resolveLink('../README.md', base)).toEqual({ kind: 'editor', uri: 'file:///C:/README.md' });
  expect(resolveLink('https://example.com/path', base)).toEqual({ kind: 'external', uri: 'https://example.com/path' });
  expect(resolveLink('mailto:a@example.com', base)).toEqual({ kind: 'external', uri: 'mailto:a@example.com' });
  expect(resolveLink('//example.com/path', base)).toEqual({ kind: 'external', uri: 'https://example.com/path' });
  for (const destination of ['', '#heading', 'command:workbench.action.closeWindow', 'javascript:alert(1)', 'data:text/plain,test']) expect(resolveLink(destination, base)).toBeUndefined();
});
