import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { headingLayout } from '../src/headings';

const accepted = JSON.parse(readFileSync(new URL('./contracts/headings.json', import.meta.url), 'utf8'));
describe('human-agreed heading contract', () => {
  it('retains full relative sizes and weights under default and tight row heights', () => {
    for (const fontSize of [14, 16, 20]) for (const height of [0, 16, 24, 32]) for (const platform of ['win32', 'linux']) {
      const { levels } = headingLayout(fontSize, height, platform);
      expect(levels.map(level => level.relativeSize)).toEqual(accepted.relativeSizes);
      expect(levels.map(level => level.fontWeight)).toEqual(accepted.fontWeights);
    }
  });
});
