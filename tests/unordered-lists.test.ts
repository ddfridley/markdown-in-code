import { describe, expect, it } from 'vitest';
import { parseComments } from '../src/markdown';
import { RenderingSession } from '../src/rendering';
import { commentText } from '../src/comment-text';

const bullets = (source: string) => parseComments(source).filter(value => value.style === 'listMarker');
describe('unordered list bullets', () => {
  for (const eol of ['\n', '\r\n']) {
    it(`maps dash, plus and star markers with nested/continuation indentation using ${JSON.stringify(eol)}`, () => {
      const source = ['const outside = 1;', '/**', ' * - **Parent**', ' *   continuation text', ' *   - Child', ' *', ' * + Plus', ' *', ' * * Star', ' */'].join(eol);
      const ranges = bullets(source);
      expect(ranges.map(value => source.slice(value.start, value.end))).toEqual(['-', '-', '+', '*']);
      for (const value of ranges) {
        expect(value.end - value.start).toBe(1);
        expect(value.region.segments.some(segment => value.start >= segment.start && value.end <= segment.end)).toBe(true);
      }
      expect(parseComments(source).filter(value => value.style === 'strong').map(value => source.slice(value.start, value.end))).toEqual(['Parent']);
    });
  }
  it('handles unprefixed block and grouped line comments without coloring over the bullet', () => {
    for (const source of ['/*\n- Parent\n  - Child\n*/', '// - Parent\n//   - Child']) {
      const { decorations, boxes } = new RenderingSession().presentation('fixture', 1, 'fixture.ts', () => source, []);
      expect(bullets(source)).toHaveLength(2);
      for (const bullet of bullets(source)) expect(commentText(boxes, decorations).every(value => value.end <= bullet.start || value.start >= bullet.end)).toBe(true);
    }
  });
  it('preserves meaningful star bullets and handles mixed slash/no-prefix block rows', () => {
    for (const [source, markers] of [
      ['/*\n* Star\n* Another\n*/', ['*', '*']],
      ['/*\n// - Slash prefix\n- Plain prefix\n*/', ['-', '-']]
    ] as const) expect(bullets(source).map(value => source.slice(value.start, value.end))).toEqual(markers);
  });
  it('leaves ordered/task markers and literal code, HTML, escapes and inline comments alone', () => {
    for (const source of ['/*\n1. Ordered\n2. Second\n*/', '/*\n- [ ] Task\n- [x] Done\n*/', '/*\n```md\n- Code\n```\n*/', '/*\n    - Indented code\n*/', '/*\n<!--\n- HTML\n-->\n*/', '/*\n\\- Literal\n*/', '// - Lone', 'const x = 1; // - Trailing', '/* - Inline */']) {
      expect(bullets(source), source).toEqual([]);
    }
    expect(bullets('/*\n- Parent\n  1. Ordered child\n     - Unordered grandchild\n*/')).toHaveLength(2);
  });
  it('reveals and restores the complete list with selections and toggling', () => {
    const source = 'const outside=1;\n/*\n- First\n- Second\n*/';
    const session = new RenderingSession();
    const render = (position: number) => session.decorations('fixture', 1, 'fixture.ts', () => source, [{ start: position, end: position }]);
    expect(render(0).filter(value => value.style === 'listMarker')).toHaveLength(2);
    expect(render(source.indexOf('First'))).toEqual([]);
    expect(render(0).filter(value => value.style === 'listMarker')).toHaveLength(2);
    session.toggle();
    expect(render(0)).toEqual([]);
  });
});
