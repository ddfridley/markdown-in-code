import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { readFile, writeFile, copyFile } from 'node:fs/promises';

export function comparePng(expectedBuffer, actualBuffer) {
  const expected = PNG.sync.read(expectedBuffer);
  const actual = PNG.sync.read(actualBuffer);
  if (expected.width !== actual.width || expected.height !== actual.height) {
    const diff = new PNG({ width: Math.max(expected.width, actual.width), height: Math.max(expected.height, actual.height) });
    const width = Math.min(expected.width, actual.width);
    const height = Math.min(expected.height, actual.height);
    const overlapExpected = new PNG({ width, height });
    const overlapActual = new PNG({ width, height });
    const overlapDiff = new PNG({ width, height });
    PNG.bitblt(expected, overlapExpected, 0, 0, width, height, 0, 0);
    PNG.bitblt(actual, overlapActual, 0, 0, width, height, 0, 0);
    const pixels = pixelmatch(overlapExpected.data, overlapActual.data, overlapDiff.data, width, height, { threshold: 0.1, includeAA: true });
    // Keep original coordinates: resizing or shifting would conceal layout regressions.
    diff.data.fill(255);
    PNG.bitblt(overlapDiff, diff, 0, 0, width, height, 0, 0);
    let unmatchedPixels = 0;
    for (let y = 0; y < diff.height; y++) {
      for (let x = 0; x < diff.width; x++) {
        if ((x < expected.width && y < expected.height) !== (x < actual.width && y < actual.height)) {
          diff.data.set([255, 0, 255, 255], 4 * (y * diff.width + x));
          unmatchedPixels++;
        }
      }
    }
    return { pass: false, pixels, unmatchedPixels, reason: `Dimensions: expected ${expected.width}x${expected.height}, actual ${actual.width}x${actual.height}; ${pixels} differing pixels in overlap, ${unmatchedPixels} unmatched edge pixels`, diff: PNG.sync.write(diff) };
  }
  const diff = new PNG({ width: actual.width, height: actual.height });
  const pixels = pixelmatch(expected.data, actual.data, diff.data, actual.width, actual.height, { threshold: 0.1, includeAA: true });
  return { pass: pixels === 0, pixels, reason: `${pixels} differing pixels`, diff: PNG.sync.write(diff) };
}

export async function compareFiles(expectedPath, actualPath, diffPath, expectedArtifactPath) {
  let expected;
  try { expected = await readFile(expectedPath); }
  catch (error) {
    if (error.code === 'ENOENT') return { pass: false, reason: `Missing baseline: ${expectedPath}` };
    throw error;
  }
  await copyFile(expectedPath, expectedArtifactPath);
  const result = comparePng(expected, await readFile(actualPath));
  if (!result.pass) await writeFile(diffPath, result.diff);
  const { diff, ...report } = result;
  return report;
}
