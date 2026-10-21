import { mapRange, type CommentRegion } from './comments';
import type { Decoration } from './markdown';

interface Node {
  type: string;
  align?: (string | null)[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: Node[];
}

/**
 * ## tableDecorations(node, region, inline) ⇒ {Decoration[]}
 * Align GFM tables within source-row constraints and fall back rather than inventing unreliable glyph widths or huge attachments.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `node` **{Node}** - Parser-recognized table, including column alignments and rows.
 * - `region` **{CommentRegion}** - Framed comment and source mapping.
 * - `inline` **{Decoration[]}** - Existing semantic spans; hidden markers determine rendered cell widths.
 *
 * ## Returns
 * **{Decoration[]}** - Cell gap/header decorations or wide plain-row attachments; unsupported tables return none.
 *
 * ## Implementation Details
 * Rich cells keep their inline decorations. Wide plain tables use one measured attachment per row so text stays unwrapped and contributes horizontal scroll width; source-based wrapped continuation space remains blank. The 4096-column cap bounds allocation and leaves oversized tables editable.
 *
 * ## Agent Notes
 * Do not silently expand support for tabs, wide/combining glyphs, emoji or irregular rows without measuring layout. Keep 4096/4097 boundaries, overflow recovery and actual scrollbar dragging tested. Never convert source text into padded table text.
 */
export function tableDecorations(node: Node, region: CommentRegion, inline: Decoration[]): Decoration[] {
  if (node.type !== 'table' || !node.children?.length || !node.align?.length) return [];
  if (!(region.kind === 'lineBlock' || (region.kind === 'block' && region.segments.length > 1))) return [];
  const rows: { start: number; end: number; cells: { start: number; end: number; left: number; right: number; width: number }[] }[] = [];
  for (const row of node.children) {
    const start = row.position?.start.offset, end = row.position?.end.offset;
    if (start === undefined || end === undefined) return [];
    const text = region.markdown.slice(start, end);
    // Latin text and common typographic punctuation occupy one editor column.
    // Keep tabs, wide glyphs, combining marks and emoji on the source fallback.
    if (/[^\x20-\x7e\u00a0-\u024f\u2010-\u2015\u2018-\u201f\u2026]/.test(text)) return [];
    const pipes: number[] = [];
    for (let i = 0; i < text.length; i++) if (text[i] === '|') {
      let escapes = 0;
      for (let j = i - 1; j >= 0 && text[j] === '\\'; j--) escapes++;
      if (!(escapes % 2)) pipes.push(i);
    }
    const leading = text.trimStart().startsWith('|');
    const trailing = pipes.at(-1) === text.trimEnd().length - 1;
    const bounds = [leading ? pipes[0] + 1 : 0, ...pipes.slice(leading ? 1 : 0, trailing ? -1 : undefined).map(value => value + 1)];
    const ends = [...pipes.slice(leading ? 1 : 0, trailing ? -1 : undefined), trailing ? pipes.at(-1)! : text.length];
    if (bounds.length !== node.align.length || ends.length !== bounds.length) return [];
    const cells = bounds.map((value, index) => {
      const raw = text.slice(value, ends[index]);
      const left = start + value + raw.length - raw.trimStart().length;
      const right = left + raw.trim().length;
      const spans = mapRange(region, { start: left, end: right });
      const hidden = new Set<number>();
      for (const span of spans) for (const decoration of inline) {
        if (decoration.region !== region || decoration.style !== 'marker') continue;
        for (let offset = Math.max(span.start, decoration.start); offset < Math.min(span.end, decoration.end); offset++) hidden.add(offset);
      }
      return { start: start + value, end: start + ends[index], left, right, width: right - left - hidden.size };
    });
    rows.push({ start, end, cells });
  }
  const widths = node.align.map((_, index) => Math.max(3, ...rows.map(row => row.cells[index].width)));
  // Keep exceptionally wide tables literal rather than allocating huge attachments.
  if (widths.reduce((sum, width) => sum + width + 3, 1) > 4096) return [];
  const result: Decoration[] = [];
  /**
   * ## gap(start, end, label) ⇒ {void}
   * Replace structural cell gaps while allowing missing outer pipes and empty cells to have zero-width source anchors.
   *
   * **Kind:** function
   * **Access:** private
   *
   * ## Parameters
   * - `start` **{number}** - Inclusive normalized Markdown offset.
   * - `end` **{number}** - Exclusive offset; may equal start for an attachment.
   * - `label` **{string}** - Border/padding text displayed in place of that source gap.
   *
   * ## Returns
   * **{void}** - Appends a source-mapped table gap if a segment can host it.
   *
   * ## Implementation Details
   * The general range mapper deliberately rejects empty spans. This local anchor path keeps that mapper strict while supporting tables without outer pipe characters.
   *
   * ## Agent Notes
   * Zero-width attachments must survive the parser final pass; do not drop them as empty text ranges.
   */
  function gap(start: number, end: number, label: string) {
    const span = start < end ? mapRange(region, { start, end })[0] : undefined;
    const segment = region.segments.find(value => start >= value.markdownStart && start <= value.markdownEnd);
    if (!span && !segment) return;
    const anchor = span ?? { start: segment!.start + start - segment!.markdownStart, end: segment!.start + start - segment!.markdownStart };
    result.push({ ...anchor, style: 'tableGap', label, region });
  }
  rows.forEach((row, rowIndex) => {
    let cursor = row.start;
    row.cells.forEach((cell, index) => {
      const extra = widths[index] - cell.width;
      const left = node.align![index] === 'right' ? extra : node.align![index] === 'center' ? Math.floor(extra / 2) : 0;
      gap(cursor, cell.left, `${index ? '' : '│'} ${' '.repeat(left)}`);
      gap(cell.right, index + 1 < row.cells.length ? row.cells[index + 1].start : row.end,
        `${' '.repeat(extra - left)} │`);
      cursor = index + 1 < row.cells.length ? row.cells[index + 1].start : row.end;
      if (!rowIndex) for (const span of mapRange(region, { start: cell.left, end: cell.right })) result.push({ ...span, region, style: 'tableHeader' });
    });
  });
  const separatorStart = region.markdown.indexOf('\n', rows[0].end) + 1;
  const separatorEnd = region.markdown.indexOf('\n', separatorStart);
  if (!separatorStart) return [];
  // A table always has its delimiter row directly after its header.
  const separator = region.markdown.slice(separatorStart, separatorEnd < 0 ? region.markdown.length : separatorEnd);
  const content = separator.search(/[|:-]/);
  if (content < 0) return [];
  gap(separatorStart + content, separatorStart + separator.trimEnd().length, `├${widths.map(width => '─'.repeat(width + 2)).join('┼')}┤`);
  // For wide plain-text tables, paint each row as one attachment. Monaco keeps
  // its source-based wrapped row count, but continuation rows contain no text.
  // Rich inline cells keep the existing layout so their formatting is retained.
  if (widths.reduce((sum, width) => sum + width + 3, 1) > 120 &&
      !inline.some(value => value.region === region && value.style !== 'commentText' &&
        rows.some(row => mapRange(region, { start: row.start, end: row.end }).some(span => value.start < span.end && value.end > span.start)))) {
    const overlays: Decoration[] = [];
    rows.forEach((row, rowIndex) => {
      const label = `│${row.cells.map((cell, index) => {
        const extra = widths[index] - cell.width;
        const left = node.align![index] === 'right' ? extra : node.align![index] === 'center' ? Math.floor(extra / 2) : 0;
        return ` ${' '.repeat(left)}${region.markdown.slice(cell.left, cell.right)}${' '.repeat(extra - left)} `;
      }).join('│')}│`;
      for (const span of mapRange(region, { start: row.start, end: row.end })) overlays.push({ ...span, region, style: rowIndex ? 'tableRow' : 'tableRowHeader', label });
    });
    const rule = result.at(-1)!;
    overlays.push({ ...rule, style: 'tableRow' });
    return [...overlays, ...result.filter(value => value.style === 'tableHeader')];
  }
  return result;
}
