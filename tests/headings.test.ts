import { describe, expect, it } from 'vitest';
import { parseComments } from '../src/markdown';
import { headingLayout } from '../src/headings';

describe('heading levels and source mapping', () => {
  for (const eol of ['\n', '\r\n']) {
    it(`maps six ATX levels and Setext titles with ${JSON.stringify(eol)}`, () => {
      const lines = ['const outside = 1;', '/**', ...Array.from({ length: 6 }, (_, i) => ` * ${'#'.repeat(i + 1)} Level ${i + 1} ##`), ' *', ' * Setext one', ' * ===', ' *', ' * Setext two', ' * ---', ' */'];
      const source = lines.join(eol);
      const ranges = parseComments(source);
      const headings = ranges.filter(value => value.style === 'heading');
      expect(headings.map(value => value.level)).toEqual([1, 2, 3, 4, 5, 6, 1, 2]);
      expect(headings.map(value => source.slice(value.start, value.end))).toEqual(['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Setext one', 'Setext two']);
      expect(ranges.filter(value => value.style === 'marker').map(value => source.slice(value.start, value.end))).toContain('===');
      expect(ranges.filter(value => value.style === 'horizontalRule')).toEqual([]);
      for (const value of ranges) expect(value.region.segments.some(segment => value.start >= segment.start && value.end <= segment.end)).toBe(true);
    });
  }
  it('retains inline formatting, escaped markers and multiline Setext content', () => {
    const source = '/*\n# **Bold** and `code`\n\nTwo\nlines\n---\n\n\\# Literal\n*/';
    const ranges = parseComments(source);
    expect(ranges.filter(value => value.style === 'heading').map(value => source.slice(value.start, value.end))).toEqual(['**Bold** and `code`', 'Two', 'lines']);
    expect(ranges.filter(value => value.style === 'strong').map(value => source.slice(value.start, value.end))).toEqual(['Bold']);
  });
  it('recognizes grouped headings and excludes code, HTML, trailing and same-line comments', () => {
    expect(parseComments('// # Group\n// next').find(value => value.style === 'heading')?.level).toBe(1);
    for (const source of ['// # Lone', 'const x=1; // # Trailing', '/* # Inline */', '/*\n```ts\n# Code\n```\n*/', '/*\n<!--\n# Hidden\n-->\n*/']) {
      expect(parseComments(source).filter(value => value.style === 'heading')).toEqual([]);
    }
  });
});

describe('heading row budget', () => {
  it('uses relative md-comments size ratios and descending density', () => {
    const result = headingLayout(16, 24, 'linux');
    expect(result.lineHeight).toBe(24);
    const sizes = result.levels.map(value => value.fontSize);
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
    expect(sizes[1]).toBeGreaterThan(sizes[2]);
    expect(sizes[2]).toBeGreaterThan(sizes[3]);
    expect(sizes).toEqual([29, 24.2, 19.3, 18.4, 17.3, 16.4]);
    expect(result.levels.map(value => value.relativeSize)).toEqual(['181%', '151%', '120%', '115%', '108%', '103%']);
    expect(result.levels.map(value => value.fontWeight)).toEqual(['800', '700', '600', '600', '500', '400']);
  });
  it('handles platform defaults, multiplier heights and tight rows explicitly', () => {
    expect(headingLayout(16, 0, 'linux').lineHeight).toBe(24);
    expect(headingLayout(16, 0, 'win32').lineHeight).toBe(22);
    expect(headingLayout(16, 2, 'win32').lineHeight).toBe(32);
    expect(headingLayout(16, 16, 'linux').levels.map(value => value.fontSize)).toEqual([19.3, 16.2, 12.9, 12.3, 11.6, 11]);
    expect(headingLayout(16, 48, 'linux').levels[0].fontSize).toBe(58);
    expect(headingLayout(20, 20, 'win32').levels.map(value => value.relativeSize)).toEqual(['121%', '101%', '80%', '77%', '72%', '69%']);
    expect(headingLayout(14, 0, 'win32').levels[0].relativeSize).toBe('164%');
    expect(headingLayout(16, 24, 'linux', 1).levels[0].fontSize).toBe(24);
    for (const invalid of [0, -1, NaN, Infinity]) expect(headingLayout(16, 24, 'linux', invalid).levels[0].relativeSize).toBe('181%');
  });
});
