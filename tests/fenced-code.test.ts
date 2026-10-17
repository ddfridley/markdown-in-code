import { describe, expect, it } from 'vitest';
import { extractComments } from '../src/comments';
import { parseComments } from '../src/markdown';
import { CODE_PALETTES, codeLanguageName } from '../src/fenced-code';

const slices = (source: string, style: string) => parseComments(source).filter(value => value.style === style).map(value => source.slice(value.start, value.end));
describe('contrasting fenced code', () => {
  it('expands known language labels and preserves unknown labels', () => {
    expect(codeLanguageName('js')).toBe('JavaScript');
    expect(codeLanguageName('TS')).toBe('TypeScript');
    expect(codeLanguageName('py')).toBe('Python');
    expect(codeLanguageName('custom-language')).toBe('custom-language');
    expect(codeLanguageName()).toBe('');
  });
  for (const eol of ['\n', '\r\n']) {
    it(`maps TS tokens and blank rows without decorating prefixes with ${JSON.stringify(eol)}`, () => {
      const source = ['const outside = 1;', '/**', ' * ```ts', ' * const value: number = 42;', ' *', ' * const text = "**not bold**";', ' * // code comment', ' * ```', ' */'].join(eol);
      expect(slices(source, 'codeKeyword')).toEqual(['const', 'number', 'const']);
      expect(slices(source, 'codeNumber')).toEqual(['42']);
      expect(slices(source, 'codeString')).toEqual(['"**not bold**"']);
      expect(slices(source, 'codeComment')).toEqual(['// code comment']);
      expect(slices(source, 'strong')).toEqual([]);
      expect(slices(source, 'codeFence')).toEqual(['```ts', '```']);
      expect(parseComments(source).filter(value => value.style === 'codeFence').map(value => value.label)).toEqual(['TypeScript', undefined]);
      expect(slices(source, 'codeBackground')).toHaveLength(6);
      expect(slices(source, 'codeBackground')).toContain('');
      const region = extractComments(source)[0];
      for (const range of parseComments(source)) {
        expect(region.segments.some(segment => range.start >= segment.start && range.end <= segment.end)).toBe(true);
        expect(source.slice(range.start, range.end)).not.toMatch(/[\r\n]/);
      }
      const foregrounds = parseComments(source).filter(value => value.style.startsWith('code') && value.style !== 'codeBackground');
      for (const [index, range] of foregrounds.entries()) {
        expect(foregrounds.slice(index + 1).every(other => range.end <= other.start || other.end <= range.start)).toBe(true);
      }
    });
  }

  it('supports JS aliases and tilde fences with closing runs at least as long as the opener', () => {
    const source = '/*\n~~~javascript\nlet value = 12;\n~~~~\n*/';
    expect(slices(source, 'codeKeyword')).toEqual(['let']);
    expect(slices(source, 'codeFence')).toEqual(['~~~javascript', '~~~~']);
  });

  it('uses a plain-code fallback for absent and unsupported fence languages', () => {
    for (const language of ['', 'python', 'unknown']) {
      const source = `/*\n\x60\x60\x60${language}\nconst value = 42;\n\x60\x60\x60\n*/`;
      expect(slices(source, 'codeBackground')).toHaveLength(3);
      expect(slices(source, 'codeText')).toContain('const value = 42;');
      expect(slices(source, 'codeKeyword')).toEqual([]);
    }
  });

  it('recognizes fences in grouped // blocks, preserves code // tokens and keeps standalone Markdown alone', () => {
    const source = '// ```js\n// // actual code comment\n// let x = 1;\n// ```';
    expect(slices(source, 'codeKeyword')).toEqual(['let']);
    expect(slices(source, 'codeComment')).toEqual(['// actual code comment']);
    expect(parseComments('// ```js')).toEqual([]);
  });

  it('contains incomplete fences and does not paint the source closing-border row', () => {
    const source = '/**\n * ```ts\n * const value = "open\n */';
    const regions = extractComments(source);
    const closing = regions[0].segments.at(-1)!;
    const ranges = parseComments(source);
    expect(slices(source, 'codeKeyword')).toEqual(['const']);
    expect(ranges.every(range => range.end <= closing.start)).toBe(true);
    expect(slices(source, 'codeFence')).toEqual(['```ts']);
  });

  it('keeps nested Markdown syntax literal and indented code outside this slice', () => {
    expect(slices('/*\n```ts\n# Heading\n**bold**\n```\n*/', 'heading')).toEqual([]);
    expect(parseComments('/*\n    const value = 42;\n*/')).toEqual([]);
  });

  it('gives every text/token color readable contrast against its own background', () => {
    function luminance(hex: string) {
      const channels = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    }
    for (const palette of Object.values(CODE_PALETTES)) {
      const background = luminance(palette.background);
      for (const [key, value] of Object.entries(palette)) {
        if (key === 'background') continue;
        const text = luminance(value);
        expect((Math.max(background, text) + 0.05) / (Math.min(background, text) + 0.05)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
