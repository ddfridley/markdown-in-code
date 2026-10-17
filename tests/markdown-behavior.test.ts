import { describe, expect, it } from 'vitest';
import { extractComments, mapRange } from '../src/comments';
import { parseComments } from '../src/markdown';

function slices(source: string, style: string) {
  return parseComments(source).filter(item => item.style === style).map(item => source.slice(item.start, item.end));
}

describe('comment Markdown policy', () => {
  it('preserves bold and emphasis at the beginning of unprefixed block lines', () => {
    const source = '/*\n**bold**\n\n*italic*\n*/';
    expect(slices(source, 'strong')).toEqual(['bold']);
    expect(slices(source, 'emphasis')).toEqual(['italic']);
  });

  it('does not turn the JSDoc opening star into a list item', () => {
    expect(extractComments('/**\n * # Heading\n */')[0].markdown).toBe('\n# Heading\n ');
    expect(slices('/**\n * # Heading\n */', 'heading')).toEqual(['Heading']);
  });

  it('keeps adjacent line comments independent and limits them to inline styling', () => {
    const source = '// **not\n// joined**\n// # Heading\nconst x = 1; // **inline**';
    expect(slices(source, 'strong')).toEqual(['inline']);
    expect(slices(source, 'heading')).toEqual([]);
    expect(slices('// # Heading', 'marker')).toEqual([]);
  });

  it('leaves HTML comment content and markers raw', () => {
    expect(parseComments('/* <!-- **hidden** --> */')).toEqual([]);
    expect(slices('/* before <!-- *hidden* --> **visible** */', 'strong')).toEqual(['visible']);
    expect(slices('/* before <!-- *hidden* --> **visible** */', 'emphasis')).toEqual([]);
  });

  it('keeps list markers and horizontal rules raw while formatting list text', () => {
    const source = '/**\n * - **item**\n *\n * ---\n */';
    expect(slices(source, 'strong')).toEqual(['item']);
    expect(slices(source, 'marker')).toEqual(['**', '**']);
  });

  it('keeps fenced and indented code raw, including language info and apparent headings', () => {
    const source = '/**\n * ```ts\n * # raw\n * **raw**\n * ```\n *\n *     **also raw**\n */';
    expect(parseComments(source)).toEqual([]);
  });

  it('respects escaping, nesting, variable-width code spans and GFM strike markers', () => {
    expect(slices('/* \\*raw\\* and **bold *italic*** */', 'emphasis')).toEqual(['italic']);
    expect(slices('/* ``a ` b`` */', 'inlineCode')).toEqual(['a ` b']);
    const strike = '/* ~one~ and ~~two~~ */';
    expect(slices(strike, 'delete')).toEqual(['one', 'two']);
    expect(slices(strike, 'marker')).toEqual(['~', '~', '~~', '~~']);
  });

  for (const eol of ['\n', '\r\n']) {
    it(`maps every nonempty Markdown subrange into comment content with ${JSON.stringify(eol)}`, () => {
      const source = ['const before = 1; /**', ' * 😀 **a', ' * b**', ' *', ' */ const after = 2;'].join(eol);
      const region = extractComments(source)[0];
      for (let start = 0; start < region.markdown.length; start++) {
        for (let end = start + 1; end <= region.markdown.length; end++) {
          const mapped = mapRange(region, { start, end });
          expect(mapped.map(span => source.slice(span.start, span.end)).join('')).toBe(region.markdown.slice(start, end).replace(/\n/g, ''));
          expect(mapped.every(span => span.start >= region.start && span.end <= region.end)).toBe(true);
        }
      }
    });
  }
});
