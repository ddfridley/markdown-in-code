import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { readFile, writeFile, copyFile } from 'node:fs/promises';

export function comparePng(expectedBuffer, actualBuffer) {
  const expected = PNG.sync.read(expectedBuffer);
  const actual = PNG.sync.read(actualBuffer);
  if (expected.width !== actual.width || expected.height !== actual.height) {
    const diff = new PNG({ width: Math.max(expected.width, actual.width), height: Math.max(expected.height, actual.height) });
    for (let index = 0; index < diff.data.length; index += 4) diff.data.set([255, 0, 255, 255], index);
    return { pass: false, reason: `Dimensions: expected ${expected.width}x${expected.height}, actual ${actual.width}x${actual.height}`, diff: PNG.sync.write(diff) };
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
