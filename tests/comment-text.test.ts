import { describe, expect, it } from 'vitest';
import { RenderingSession } from '../src/rendering';
import { commentText } from '../src/comment-text';

describe('rendered comment prose', () => {
  for (const eol of ['\n', '\r\n']) {
    it(`colors prose and inline formatting without overriding special foregrounds with ${JSON.stringify(eol)}`, () => {
      const source = ['const outside = 1;', '/**', ' * # Heading', ' * Ordinary **bold** and *italic* text.', ' * ```ts', ' * const value = 42;', ' * ```', ' *', ' * ---', ' */'].join(eol);
      const session = new RenderingSession();
      const { decorations, boxes } = session.presentation('fixture', 1, 'fixture.ts', () => source, [{ start: 0, end: 0 }]);
      const prose = commentText(boxes, decorations);
      const special = decorations.filter(value => value.style === 'heading' || value.style === 'marker' || value.style === 'horizontalRule' || value.style.startsWith('code'));
      expect(prose.map(value => source.slice(value.start, value.end)).join('')).toContain('Ordinary bold and italic text.');
      for (const value of prose) {
        expect(value.region.segments.some(segment => value.start >= segment.start && value.end <= segment.end)).toBe(true);
        expect(special.every(other => value.end <= other.start || other.end <= value.start)).toBe(true);
      }
    });
  }
  it('colors plain framed comments but clears prose on reveal and toggle', () => {
    const source = 'const outside=1;\n/*\nOrdinary text\n*/';
    const session = new RenderingSession();
    const render = (position: number) => {
      const { decorations, boxes } = session.presentation('fixture', 1, 'fixture.ts', () => source, [{ start: position, end: position }]);
      return commentText(boxes, decorations);
    };
    expect(render(0).map(value => source.slice(value.start, value.end))).toContain('Ordinary text');
    expect(render(source.indexOf('Ordinary'))).toEqual([]);
    session.toggle();
    expect(render(0)).toEqual([]);
  });
});
