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
    expect(sizes).toEqual([24, 20, 16, 15.2, 14.4, 13.6]);
    expect(result.levels.map(value => value.relativeSize)).toEqual(['150%', '125%', '100%', '95%', '90%', '85%']);
    expect(result.levels.map(value => value.fontWeight)).toEqual(['800', '700', '600', '600', '500', '400']);
  });
  it('handles platform defaults, multiplier heights and tight rows explicitly', () => {
    expect(headingLayout(16, 0, 'linux').lineHeight).toBe(24);
    expect(headingLayout(16, 0, 'win32').lineHeight).toBe(22);
    expect(headingLayout(16, 2, 'win32').lineHeight).toBe(32);
    expect(headingLayout(16, 16, 'linux').levels.map(value => value.fontSize)).toEqual([24, 20, 16, 15.2, 14.4, 13.6]);
    expect(headingLayout(16, 48, 'linux').levels[0].fontSize).toBe(24);
    expect(headingLayout(20, 20, 'win32').levels.map(value => value.relativeSize)).toEqual(['150%', '125%', '100%', '95%', '90%', '85%']);
    expect(headingLayout(14, 0, 'win32').levels[0].relativeSize).toBe('150%');
  });
});
