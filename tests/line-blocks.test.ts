import { describe, expect, it } from 'vitest';
import { extractComments, mapRange } from '../src/comments';
import { buildBoxes } from '../src/boxes';
import { parseComments } from '../src/markdown';
import { RenderingSession } from '../src/rendering';

describe('consecutive standalone line-comment blocks', () => {
  for (const eol of ['\n', '\r\n']) {
    it(`recognizes and maps a three-line block with ${JSON.stringify(eol)}`, () => {
      const source = ['const before = 1;', '  // # Heading', '  // **multi', '  // line**', 'const after = 2;'].join(eol);
      const regions = extractComments(source);
      expect(regions).toHaveLength(1);
      expect(regions[0].kind).toBe('lineBlock');
      expect(regions[0].markdown).toBe('# Heading\n**multi\nline**');
      const parsed = parseComments(source);
      expect(parsed.filter(item => item.style === 'heading').map(item => source.slice(item.start, item.end))).toEqual(['Heading']);
      expect(parsed.filter(item => item.style === 'strong').map(item => source.slice(item.start, item.end))).toEqual(['multi', 'line']);
      const boxes = buildBoxes(source, regions);
      expect(boxes.map(box => box.text)).toEqual(['┌ ', '│ ', '└ ']);
      expect(boxes.filter(box => box.ruleAnchor !== undefined)).toHaveLength(2);
      expect(boxes.flatMap(box => box.hidden).map(span => source.slice(span.start, span.end))).toEqual(['// ', '  // ', '  // ']);
      for (let start = 0; start < regions[0].markdown.length; start++) {
        const mapped = mapRange(regions[0], { start, end: regions[0].markdown.length });
        expect(mapped.map(span => source.slice(span.start, span.end)).join('')).toBe(regions[0].markdown.slice(start).replace(/\n/g, ''));
      }
    });
  }

  it('does not join across code, blank lines or trailing comments', () => {
    const source = '// one\n\n// two\nconst x = 1; // trailing\n// lone\nconst y = 2;\n// three\n// four';
    expect(extractComments(source).map(region => region.kind)).toEqual(['line', 'line', 'line', 'line', 'lineBlock']);
  });

  it('retains empty // rows as part of the block', () => {
    const source = '//\n// # Heading\n//';
    const region = extractComments(source)[0];
    expect(region.markdown).toBe('\n# Heading\n');
    expect(buildBoxes(source, [region]).map(box => box.text)).toEqual(['┌', '│ ', '└']);
  });

  it('reveals and restores the entire run from any line and respects the toggle', () => {
    const source = 'const x = 1;\n// # Heading\n// text\n// end';
    const session = new RenderingSession();
    const read = () => source;
    expect(session.presentation('a', 1, 'a.ts', read, []).boxes).toHaveLength(3);
    const offset = source.indexOf('text');
    expect(session.presentation('a', 1, 'a.ts', read, [{ start: offset, end: offset }])).toEqual({ decorations: [], boxes: [] });
    expect(session.presentation('a', 1, 'a.ts', read, []).boxes).toHaveLength(3);
    session.toggle();
    expect(session.presentation('a', 1, 'a.ts', read, [])).toEqual({ decorations: [], boxes: [] });
  });
});
