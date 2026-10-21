import { afterEach, expect, it, vi } from 'vitest';
// @ts-expect-error Renderer orchestration is intentionally plain JavaScript.
import { captureStableFrames } from '../scripts/visual/cdp.mjs';

afterEach(() => vi.restoreAllMocks());

function renderer(values: string[]) {
  let elapsed = 0, index = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => elapsed);
  return { command: vi.fn(async (method: string) => {
    if (method !== 'Page.captureScreenshot') return {};
    elapsed += 200;
    return { data: Buffer.from(values[Math.min(index++, values.length - 1)]).toString('base64') };
  }) };
}

it('waits beyond fifteen changing frames and returns only three identical frames', async () => {
  const cdp = renderer([...Array.from({ length: 20 }, (_, index) => String(index)), 'settled']);
  expect((await captureStableFrames(cdp, {})).toString()).toBe('settled');
  expect(cdp.command.mock.calls.filter(([method]) => method === 'Page.captureScreenshot')).toHaveLength(23);
});

it('fails continuous motion and retains the last three unmodified frames', async () => {
  const cdp = renderer(Array.from({ length: 100 }, (_, index) => String(index)));
  const save = vi.fn();
  await expect(captureStableFrames(cdp, {}, save)).rejects.toThrow('within 8 seconds');
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0].map((frame: Buffer) => frame.toString())).toEqual(['37', '38', '39']);
});
