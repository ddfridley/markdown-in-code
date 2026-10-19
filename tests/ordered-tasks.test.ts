import { expect, it } from 'vitest';
import { parseComments } from '../src/markdown';
import { RenderingSession } from '../src/rendering';
import { commentText } from '../src/comment-text';

for (const eol of ['\n', '\r\n']) it(`numbers ordered lists independently and renders tasks with ${JSON.stringify(eol)}`, () => {
  const source = ['const outside=1;', '/**', ' * 3) **First**', ' * 1) Second', ' *', ' *    7. Nested', ' *    1. Next', ' *', ' * - [ ] Pending', ' * - [X] Done', ' *   - Child', ' */'].join(eol);
  const decorations = parseComments(source);
  expect(decorations.filter(d => d.style === 'orderedMarker').map(d => [source.slice(d.start, d.end), d.label])).toEqual([['3)', '3.'], ['1)', '4.'], ['7.', '7.'], ['1.', '8.']]);
  expect(decorations.filter(d => d.style === 'taskMarker').map(d => [source.slice(d.start, d.end), d.label])).toEqual([['-', '☐'], ['-', '☑']]);
  expect(decorations.filter(d => d.style === 'listMarker')).toHaveLength(1);
  expect(decorations.filter(d => d.style === 'strong').map(d => source.slice(d.start, d.end))).toEqual(['First']);
});

it('keeps literal contexts raw and supports ordered tasks and grouped comments', () => {
  for (const source of ['/*\n```md\n1. Ordered\n- [ ] Task\n```\n*/', '/*\n<!--\n1. Ordered\n-->\n*/', '/* 1. Inline */', '// - [ ] Lone']) {
    expect(parseComments(source).filter(d => d.style === 'orderedMarker' || d.style === 'taskMarker')).toEqual([]);
  }
  expect(parseComments('// 1. [ ] Pending\n// 2. [x] Done').filter(d => d.style === 'taskMarker').map(d => d.label)).toEqual(['☐', '☑']);
  expect(parseComments('// 1. [ ] Pending\n// 1. [x] Done').filter(d => d.style === 'orderedMarker').map(d => d.label)).toEqual(['1.', '2.']);
});

it('reveals source, restores markers and prevents prose colors covering them', () => {
  const source = 'const outside=1;\n/*\n1. First\n2. Second\n\n- [ ] Task\n*/';
  const session = new RenderingSession();
  const render = (position: number) => session.presentation('tasks', 1, 'tasks.ts', () => source, [{ start: position, end: position }]);
  const { decorations, boxes } = render(0);
  const markers = decorations.filter(d => d.style === 'orderedMarker' || d.style === 'taskMarker');
  expect(markers).toHaveLength(3);
  for (const marker of markers) expect(commentText(boxes, decorations).every(d => d.end <= marker.start || d.start >= marker.end)).toBe(true);
  expect(render(source.indexOf('First')).decorations).toEqual([]);
  expect(render(0).decorations).toEqual(decorations);
  session.toggle();
  expect(render(0).decorations).toEqual([]);
});
