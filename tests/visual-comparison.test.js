import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { comparePng, compareFiles } from '../scripts/visual/compare.mjs';
function blank(width = 40, height = 20) {
  const png = new PNG({ width, height });
  png.data.fill(255);
  return png;
}
describe('visual approval gate', () => {
  it('accepts identical pixels and rejects a missing one-pixel border', () => {
    const expected = blank();
    for (let x = 0; x < expected.width; x++) expected.data.set([0, 0, 0, 255], 4 * (5 * expected.width + x));
    const actual = blank();
    expect(comparePng(PNG.sync.write(expected), PNG.sync.write(expected)).pass).toBe(true);
    const changed = comparePng(PNG.sync.write(expected), PNG.sync.write(actual));
    expect(changed.pass).toBe(false);
    expect(changed.pixels).toBe(40);
    expect(PNG.sync.read(changed.diff).width).toBe(40);
  });
  it('rejects shifted borders and dimensions', () => {
    const a = blank();
    const b = blank();
    for (let x = 0; x < a.width; x++) {
      a.data.set([0, 0, 0, 255], 4 * (5 * a.width + x));
      b.data.set([0, 0, 0, 255], 4 * (6 * b.width + x));
    }
    expect(comparePng(PNG.sync.write(a), PNG.sync.write(b)).pass).toBe(false);
    expect(comparePng(PNG.sync.write(a), PNG.sync.write(blank(41))).reason).toContain('Dimensions');
  });
  it('fails missing baselines without creating an expected file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mic-visual-'));
    try {
      const expected = join(directory, 'expected.png');
      const actual = join(directory, 'actual.png');
      await writeFile(actual, PNG.sync.write(blank()));
      const report = await compareFiles(expected, actual, join(directory, 'diff.png'), join(directory, 'copy.png'));
      expect(report.pass).toBe(false);
      expect(report.reason).toContain('Missing baseline');
      await expect(readFile(expected)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
