import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractComments, mapRange } from '../src/comments';
import { parseComments } from '../src/markdown';

const fixture = readFileSync(new URL('./fixtures/comments.ts', import.meta.url), 'utf8');

describe('comment adapter', () => {
  for (const eol of ['\n', '\r\n']) {
    it(`maps the fixture with ${JSON.stringify(eol)} without changing source`, () => {
      const source = fixture.replace(/\r?\n/g, eol);
      const original = source;
      const regions = extractComments(source);
      expect(regions.map(region => region.kind)).toEqual(['block', 'line', 'line']);
      const decorations = parseComments(source);
      expect(decorations.filter(item => item.style === 'strong').map(item => source.slice(item.start, item.end))).toEqual(['Bold', 'multiline', 'bold', 'bold']);
      expect(decorations.filter(item => item.style === 'emphasis').map(item => source.slice(item.start, item.end))).toEqual(['italic', 'italic']);
      for (const decoration of decorations) {
        expect(decoration.region.segments.some(segment => decoration.start >= segment.start && decoration.end <= segment.end)).toBe(true);
        expect(source.slice(decoration.start, decoration.end)).not.toMatch(/[\r\n]/);
      }
      expect(source).toBe(original);
    });
  }

  it('ignores comment-like text in strings, regexes, templates and JSX', () => {
    const source = [
      'const a = "// **fake**";',
      "const b = '/* **fake** */';",
      'const r = /[/*]fake/;',
      'const t = `// fake ${1 /* **real** */} /* fake */`;',
      'const jsx = <div title="/* fake */">// fake</div>;',
      '// **last**'
    ].join('\n');
    expect(extractComments(source, 'fixture.tsx').map(region => region.markdown.trim())).toEqual(['**real**', '**last**']);
  });

  for (const eol of ['\n', '\r\n']) {
    it(`maps heading text and hides hash markers behind comment prefixes with ${JSON.stringify(eol)}`, () => {
      const source = ['/**', ' * # Comment heading', ' * ## Smaller heading ##', ' * #hashtag stays raw', ' */'].join(eol);
      const decorations = parseComments(source);
      const slices = (style: string) => decorations.filter(item => item.style === style).map(item => source.slice(item.start, item.end));
      expect(slices('heading')).toEqual(['Comment heading', 'Smaller heading']);
      expect(slices('marker')).toEqual(['# ', '## ', ' ##']);
      for (const decoration of decorations) {
        expect(decoration.region.segments.some(segment => decoration.start >= segment.start && decoration.end <= segment.end)).toBe(true);
      }
    });
  }

  it('handles empty, unterminated, adjacent and nested-looking comments', () => {
    expect(extractComments('')).toEqual([]);
    expect(parseComments('/**/ //')).toEqual([]);
    const source = '/* **one** */ /* **two** */\n/* **open**';
    expect(parseComments(source).filter(item => item.style === 'strong').map(item => source.slice(item.start, item.end))).toEqual(['one', 'two', 'open']);
    expect(extractComments('/* outer /* inner */ const code = 1;').map(region => region.markdown)).toEqual(['outer /* inner ']);
  });

  it('preserves UTF-16 offsets, tabs, blank lines and Markdown indentation', () => {
    const source = '\t/**\r\n\t * 😀 **yes**\r\n\t *\r\n\t *     code\r\n\t */';
    const region = extractComments(source)[0];
    expect(region.markdown).toContain('😀 **yes**\n\n    code');
    const strong = parseComments(source).find(item => item.style === 'strong')!;
    expect(source.slice(strong.start, strong.end)).toBe('yes');
    expect(mapRange(region, { start: -1, end: 10 })).toEqual([]);
    expect(mapRange(region, { start: 0, end: region.markdown.length + 1 })).toEqual([]);
  });

  it('does not parse Markdown within inline or fenced code', () => {
    const source = '/*\n * `**raw**`\n * ```\n * **also raw**\n * ```\n */';
    expect(parseComments(source).filter(item => item.style === 'strong')).toEqual([]);
  });

  it('handles comments before and after tokens and in template expressions', () => {
    const source = '/* **a** */const x = /* **b** */1;/* **c** */\nconst t = `text ${/* **d** */ x // **e**\n}`;';
    expect(extractComments(source).map(region => region.markdown.trim())).toEqual(['**a**', '**b**', '**c**', '**d**', '**e**']);
  });
});
