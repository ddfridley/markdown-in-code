import { describe, expect, it } from 'vitest';
import { parseComments } from '../src/markdown';

const rules = (source: string) => parseComments(source).filter(value => value.style === 'horizontalRule');
describe('Markdown horizontal rules', () => {
  for (const eol of ['\n', '\r\n']) {
    it(`maps thematic breaks with ${JSON.stringify(eol)} without prefixes or newlines`, () => {
      const source = ['const outside = 1;', '/**', ' * Before', ' *', ' * ---', ' *', ' * * * *', ' *', ' * ___', ' */'].join(eol);
      expect(rules(source).map(value => source.slice(value.start, value.end))).toEqual(['---', '* * *', '___']);
      for (const value of rules(source)) expect(value.region.segments.some(segment => value.start >= segment.start && value.end <= segment.end)).toBe(true);
    });
  }
  it('renders grouped line-comment rules but keeps lone, trailing and same-line comments raw', () => {
    expect(rules('// before\n//\n// ---\n// after')).toHaveLength(1);
    for (const source of ['// ---', 'const x = 1; // ---', '/* --- */']) expect(rules(source)).toEqual([]);
  });
  it('distinguishes rules from Setext headings, escaped markers, HTML and code', () => {
    for (const content of ['Title\n---', '\\---', '<!--\n---\n-->', '```ts\n---\n```', '    ---', '- item']) {
      expect(rules(`/*\n${content}\n*/`), content).toEqual([]);
    }
    expect(rules('/*\n---\n*/')).toHaveLength(1);
  });
});
