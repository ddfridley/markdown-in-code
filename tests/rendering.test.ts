import { describe, expect, it, vi } from 'vitest';
import { extractComments } from '../src/comments';
import { RenderingSession, revealsComment } from '../src/rendering';

const source = 'const x = 1; /* **first** */ const y = 2; // *second*';
const regions = extractComments(source);

describe('selection policy', () => {
  it('reveals the entire comment at either delimiter and at the insertion point after it', () => {
    const region = regions[0];
    for (const offset of [region.start, region.start + 1, region.end - 1, region.end]) {
      expect(revealsComment(region, { start: offset, end: offset })).toBe(true);
    }
    expect(revealsComment(region, { start: region.start - 1, end: region.start - 1 })).toBe(false);
    expect(revealsComment(region, { start: region.end + 1, end: region.end + 1 })).toBe(false);
  });

  it('uses half-open selection boundaries and accepts reversed selections', () => {
    const region = regions[0];
    expect(revealsComment(region, { start: 0, end: region.start })).toBe(false);
    expect(revealsComment(region, { start: region.end, end: source.length })).toBe(false);
    expect(revealsComment(region, { start: region.end + 1, end: region.start - 1 })).toBe(true);
  });

  it('reveals every comment crossed by a multiline selection', () => {
    const text = '/* **first** */\nconst middle = 1;\n// *second*';
    const session = new RenderingSession();
    expect(session.decorations('a', 1, 'a.ts', () => text, [{ start: 3, end: text.length }])).toEqual([]);
  });
});

describe('rendering session', () => {
  it('reveals only selected comments across multiple carets and restores them on leaving', () => {
    const session = new RenderingSession();
    const read = () => source;
    const all = session.decorations('a', 1, 'a.ts', read, []);
    const one = session.decorations('a', 1, 'a.ts', read, [{ start: regions[0].start, end: regions[0].start }]);
    expect(one.length).toBeGreaterThan(0);
    expect(one.every(item => item.region.start === regions[1].start)).toBe(true);
    expect(session.decorations('a', 1, 'a.ts', read, regions.map(region => ({ start: region.start, end: region.start })))).toEqual([]);
    expect(session.decorations('a', 1, 'a.ts', read, [{ start: 0, end: 0 }])).toEqual(all);
  });

  it('shares parsed ranges across split editors without sharing their selections', () => {
    const session = new RenderingSession();
    const read = vi.fn(() => source);
    const rendered = session.decorations('a', 1, 'a.ts', read, []);
    expect(session.decorations('a', 1, 'a.ts', read, [{ start: 0, end: source.length }])).toEqual([]);
    expect(session.decorations('a', 1, 'a.ts', read, [])).toEqual(rendered);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('toggles globally and reads the newest source after edits while disabled', () => {
    const session = new RenderingSession();
    const read = vi.fn(() => source);
    expect(session.decorations('a', 1, 'a.ts', read, []).length).toBeGreaterThan(0);
    session.toggle();
    expect(session.decorations('a', 2, 'a.ts', read, [])).toEqual([]);
    expect(session.decorations('b', 1, 'b.js', read, [])).toEqual([]);
    expect(read).toHaveBeenCalledTimes(1);
    session.toggle();
    const changed = '// **updated**';
    expect(session.decorations('a', 2, 'a.ts', () => changed, []).filter(item => item.style === 'strong').map(item => changed.slice(item.start, item.end))).toEqual(['updated']);
    expect(session.decorations('b', 1, 'b.js', read, []).length).toBeGreaterThan(0);
  });

  it('invalidates on document version changes and closing/reopening at the same version', () => {
    const session = new RenderingSession();
    session.decorations('a', 1, 'a.ts', () => source, []);
    expect(session.decorations('a', 2, 'a.ts', () => 'const plain = 1;', [])).toEqual([]);
    session.close('a');
    expect(session.decorations('a', 2, 'a.ts', () => source, []).length).toBeGreaterThan(0);
  });
});
