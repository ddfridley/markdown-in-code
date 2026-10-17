import { describe, expect, it, vi } from 'vitest';
import { extractComments } from '../src/comments';
import { buildBoxes, columns } from '../src/boxes';
import { parseComments } from '../src/markdown';
import { RenderingSession } from '../src/rendering';

describe('block-comment frames', () => {
  for (const eol of ['\n', '\r\n']) {
    it(`normalizes mixed prefixes and maps the frame with ${JSON.stringify(eol)}`, () => {
      const source = ['/**', ' * **one**', '* *two*', '// three', 'four', ' */'].join(eol);
      const regions = extractComments(source);
      expect(regions[0].markdown).toBe('\n**one**\n*two*\nthree\nfour\n ');
      const boxes = buildBoxes(source, regions);
      expect(boxes.map(box => box.kind)).toEqual(['top', 'content', 'content', 'content', 'content', 'bottom']);
      expect(boxes[0].text).toBe('┌');
      expect(boxes.at(-1)!.text).toBe('└');
      expect(boxes[0].ruleAnchor).toBe(boxes[0].anchor);
      expect(boxes.at(-1)!.ruleAnchor).toBe(boxes.at(-1)!.anchor);
      for (const box of boxes) {
        const lineStart = source.lastIndexOf('\n', box.anchor - 1) + 1;
        expect(columns(source.slice(lineStart, box.anchor), 4) + box.marginColumns).toBe(0);
        for (const span of box.hidden) {
          expect(span.start).toBeGreaterThanOrEqual(regions[0].start);
          expect(span.end).toBeLessThanOrEqual(regions[0].end);
          expect(source.slice(span.start, span.end)).not.toMatch(/[\r\n]/);
        }
        if (box.kind === 'content') expect(box.text).toBe('│ ');
      }
      expect(parseComments(source).filter(item => item.style === 'strong').map(item => source.slice(item.start, item.end))).toEqual(['one']);
    });
  }

  it('preserves plain-block star lists, emphasis, code indentation and fenced // text', () => {
    const source = '/*\n* list item\n\n**bold**\n\n```js\n// code comment\n```\n*/';
    const region = extractComments(source)[0];
    expect(region.markdown).toContain('* list item');
    expect(region.markdown).toContain('**bold**');
    expect(region.markdown).toContain('```js\n// code comment\n```');
    const prefixed = '/**\n *     indented code\n * * list item\n */';
    expect(extractComments(prefixed)[0].markdown).toContain('    indented code\n* list item');
  });

  it('aligns tabs and empty lines to the block opening and leaves content indentation', () => {
    const source = '\t/**\n\t * title\n\t *\n\t *     code\n\t */';
    for (const tabSize of [2, 4, 8]) {
      const boxes = buildBoxes(source, extractComments(source), tabSize);
      for (const box of boxes) {
        const lineStart = source.lastIndexOf('\n', box.anchor - 1) + 1;
        expect(columns(source.slice(lineStart, box.anchor), tabSize) + box.marginColumns).toBe(tabSize);
      }
      expect(source.slice(boxes[3].anchor).startsWith('    code')).toBe(true);
    }
  });

  it('removes common block indentation without stripping unprefixed lists or indented code', () => {
    const source = 'function f() {\n    /*\n    * list item\n\n        // indented code\n    */\n}';
    const region = extractComments(source)[0];
    expect(region.markdown).toContain('* list item\n\n    // indented code');
    const plain = 'function f() {\n    /*\n    plain text\n    // decorated text\n    */\n}';
    expect(extractComments(plain)[0].markdown).toContain('plain text\ndecorated text');
  });

  it('frames plain multiline and incomplete comments without Markdown', () => {
    for (const source of ['/*', '/*\nplain', '/* inline\nplain */']) {
      const regions = extractComments(source);
      const boxes = buildBoxes(source, regions);
      expect(boxes.length).toBeGreaterThan(0);
      expect(boxes.every(box => box.anchor >= 0 && box.anchor <= source.length)).toBe(true);
      expect(boxes.flatMap(box => box.hidden).every(span => span.start >= 0 && span.end <= source.length && span.end >= span.start)).toBe(true);
    }
    const source = 'const before = 1; /* plain */ const after = 2;';
    expect(buildBoxes(source, extractComments(source))).toEqual([]);
    expect(buildBoxes('// plain', extractComments('// plain'))).toEqual([]);
  });

  it('keeps same-line block delimiters visible while formatting only inline Markdown', () => {
    for (const source of ['/* **Inline comment** */', 'const x = 1; /* **Inline comment** */ const y = 2;']) {
      expect(buildBoxes(source, extractComments(source))).toEqual([]);
      const parsed = parseComments(source);
      expect(parsed.filter(item => item.style === 'strong').map(item => source.slice(item.start, item.end))).toEqual(['Inline comment']);
      expect(parsed.filter(item => item.style === 'marker').map(item => source.slice(item.start, item.end))).toEqual(['**', '**']);
    }
    expect(buildBoxes('/**/', extractComments('/**/'))).toEqual([]);
    expect(parseComments('/* # Inline heading */')).toEqual([]);
  });

  it('shares visibility and toggle policy with Markdown, even for a plain comment', () => {
    const source = 'const x = 1;\n/*\nplain\n*/';
    const session = new RenderingSession();
    const read = vi.fn(() => source);
    expect(session.presentation('a', 1, 'a.ts', read, []).boxes.length).toBe(3);
    const offset = source.indexOf('plain');
    expect(session.presentation('a', 1, 'a.ts', read, [{ start: offset, end: offset }]).boxes).toEqual([]);
    session.toggle();
    expect(session.presentation('a', 1, 'a.ts', read, []).boxes).toEqual([]);
    session.toggle();
    expect(session.presentation('a', 1, 'a.ts', read, []).boxes.length).toBe(3);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
