import { expect, it } from 'vitest';
import { parseComments } from '../src/markdown';
import { RenderingSession } from '../src/rendering';
import { readFileSync } from 'node:fs';

function rendered(source: string) {
  const replacements = parseComments(source).filter(value => value.style === 'tableGap' || value.style === 'tableRow' || value.style === 'tableRowHeader' || value.style === 'marker')
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let result = '', offset = 0;
  for (const value of replacements) {
    result += source.slice(offset, value.start) + (value.style !== 'marker' ? value.label : '');
    offset = value.end;
  }
  return result + source.slice(offset);
}

for (const eol of ['\n', '\r\n']) it(`aligns ragged table columns and header rule with ${JSON.stringify(eol)}`, () => {
  const source = ['/*', '| Name | Count |', '| :--- | ---: |', '| A | 2 |', '| Longer | 10 |', '*/'].join(eol);
  expect(rendered(source).split(eol).slice(1, -1)).toEqual([
    '│ Name   │ Count │', '├────────┼───────┤', '│ A      │     2 │', '│ Longer │    10 │'
  ]);
  const decorations = parseComments(source);
  expect(decorations.filter(value => value.style === 'tableHeader').map(value => source.slice(value.start, value.end))).toEqual(['Name', 'Count']);
  expect(decorations.every(value => value.start >= value.region.start && value.end <= value.region.end)).toBe(true);
});

it('supports omitted outer pipes, center alignment, inline formatting, links and escaped pipes', () => {
  const source = '/*\nName | Note\n:---: | ---\n**A** | [go](https://example.com)\nLonger | a\\|b\n*/';
  const output = rendered(source).split('\n');
  expect(output[1]).toBe('│  Name  │ Note │');
  expect(output[3]).toBe('│   A    │ go   │');
  expect(output[4]).toBe('│ Longer │ a\\|b │');
  expect(parseComments(source).some(value => value.style === 'strong')).toBe(true);
  expect(parseComments(source).some(value => value.style === 'link' && value.destination === 'https://example.com')).toBe(true);
});

it('preserves empty cells and renders header-only tables', () => {
  expect(rendered('/*\n| A | B |\n| --- | --- |\n| | x |\n*/')).toContain('│     │ x   │');
  expect(rendered('/*\n| A | B |\n| --- | --- |\n*/')).toContain('├─────┼─────┤');
});

it('renders the copied plan table with long descriptions and typographic dashes', () => {
  const source = readFileSync(new URL('./fixtures/tables-long.ts', import.meta.url), 'utf8');
  const decorations = parseComments(source, 'tables-long.ts');
  expect(decorations.filter(value => value.style === 'tableHeader').map(value => source.slice(value.start, value.end)))
    .toEqual(['Order', 'Slice', 'Scope and completion check']);
  const rows = rendered(source).split(/\r?\n/).filter(value => value.includes('│'));
  expect(rows).toHaveLength(11);
  expect(new Set(rows.map(value => value.indexOf('│', value.indexOf('│') + 1)))).toHaveProperty('size', 1);
  const rule = decorations.find(value => value.style === 'tableRow' && value.label?.startsWith('├'))!;
  expect(rule.label!.length).toBeGreaterThan(240);
  expect(rule.label!.length).toBeLessThan(4096);
  expect(rendered(source)).toContain('1–6');
  expect(decorations.every(value => value.start >= value.region.start && value.end <= value.region.end)).toBe(true);
});

it('bounds attachment allocation for extreme cell widths', () => {
  const source = `/*\n| A | B |\n| --- | --- |\n| ${'x'.repeat(4096)} | y |\n*/`;
  expect(parseComments(source).some(value => value.style.startsWith('table'))).toBe(false);
});

for (const [columns, supported] of [[4096, true], [4097, false]] as const) it(`handles the ${columns}-column boundary gracefully`, () => {
  // One column has four border/padding characters in addition to its content.
  const source = `const outside=1;\n/*\n| Description |\n| --- |\n| ${'x'.repeat(columns - 4)} |\n*/`;
  const decorations = parseComments(source);
  const table = decorations.filter(value => value.style.startsWith('table'));
  expect(table.length > 0).toBe(supported);
  if (supported) expect(table.find(value => value.style === 'tableRow')!.label).toHaveLength(columns);
  else expect(rendered(source)).toBe(source);
});

it('keeps an oversized fixture editable without affecting the next table', () => {
  const source = readFileSync(new URL('./fixtures/tables-overflow.ts', import.meta.url), 'utf8');
  const oversizedEnd = source.indexOf('*/') + 2;
  expect(source.split('\n').some(line => line.length > 4096)).toBe(true);
  const session = new RenderingSession();
  const show = (version: number, text: string, position: number) => session.presentation('overflow', version, 'overflow.ts', () => text, [{ start: position, end: position }]);
  const initial = show(1, source, 0);
  expect(initial.decorations.filter(value => value.style.startsWith('table')).every(value => value.start >= oversizedEnd)).toBe(true);
  expect(initial.decorations.some(value => value.style === 'tableHeader' && source.slice(value.start, value.end) === 'Healthy table')).toBe(true);
  const cell = source.indexOf('This oversized cell');
  expect(show(1, source, cell).decorations.every(value => value.start >= oversizedEnd)).toBe(true);
  session.toggle();
  expect(show(1, source, 0).decorations).toEqual([]);
  session.toggle();
  const edited = source.replace('This oversized cell', 'Edited oversized cell');
  expect(show(2, edited, 0).decorations.some(value => value.style === 'tableHeader')).toBe(true);
  expect(show(2, edited, 0).decorations.filter(value => value.style.startsWith('table')).every(value => value.start >= edited.indexOf('*/') + 2)).toBe(true);
  const recovered = edited.replace(/Edited oversized cell[^\n]*END OF OVERSIZED CELL/, 'Recovered');
  expect(show(3, recovered, 0).decorations.filter(value => value.style === 'tableHeader' && value.start < recovered.indexOf('*/'))
    .map(value => recovered.slice(value.start, value.end))).toEqual(['Name', 'Description']);
  expect(recovered).toContain('| Long | Recovered |');
});

it('uses one unwrapped attachment per wide plain-text row and preserves rich cells', () => {
  const text = 'Description '.repeat(15).trim();
  const source = `/*\n| Name | Detail |\n| --- | --- |\n| First | ${text} |\n| Second | short |\n*/`;
  const rows = parseComments(source).filter(value => value.style === 'tableRow' || value.style === 'tableRowHeader');
  expect(rows).toHaveLength(4);
  expect(rows.every(value => !value.label!.includes('\n'))).toBe(true);
  expect(rows.find(value => value.label!.includes('First'))!.label).toContain(text);
  expect(rows.find(value => value.label!.includes('Second'))).toBeDefined();
  const rich = parseComments(source.replace('First', '**First**'));
  expect(rich.some(value => value.style === 'strong')).toBe(true);
  expect(rich.some(value => value.style === 'tableGap')).toBe(true);
  expect(rich.some(value => value.style === 'tableRow')).toBe(false);
});

it('leaves literal, unsupported-width and irregular tables in their source layout', () => {
  for (const content of ['```md\n| A | B |\n| --- | --- |\n```', '| A | B |\n| --- | --- |\n| x |', '| A | B |\n| --- | --- |\n| 界 | x |', '| A | B |\n| --- | --- |\n| a\tb | x |']) {
    expect(parseComments(`/*\n${content}\n*/`).filter(value => value.style.startsWith('table'))).toEqual([]);
  }
});

it('composes with comment prefixes and quote bars, and respects source reveal and toggle', () => {
  const source = 'const outside=1;\n/**\n * > | **Name** | N |\n * > | --- | ---: |\n * > | A | 1 |\n */';
  const session = new RenderingSession();
  const show = (position: number) => session.presentation('table', 1, 'table.ts', () => source, [{ start: position, end: position }]);
  const presentation = show(0);
  expect(presentation.decorations.some(value => value.style === 'tableGap')).toBe(true);
  const quotes = presentation.decorations.filter(value => value.style === 'quoteMarker');
  for (const gap of presentation.decorations.filter(value => value.style === 'tableGap')) {
    expect(quotes.every(quote => gap.end <= quote.start || gap.start >= quote.end)).toBe(true);
  }
  expect(show(source.indexOf('Name')).decorations).toEqual([]);
  expect(show(0)).toEqual(presentation);
  session.toggle();
  expect(show(0).decorations).toEqual([]);
});
