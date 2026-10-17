import type { CommentRegion, Span } from './comments';

export interface BoxLine {
  region: CommentRegion;
  kind: 'top' | 'content' | 'bottom' | 'compact';
  hidden: Span[];
  anchor: number;
  text: string;
  marginColumns: number;
  ruleAnchor?: number;
}

/** Monospace editor columns, including tab stops and UTF-16 surrogate pairs. */
export function columns(text: string, tabSize: number, initial = 0): number {
  let column = initial;
  for (const character of text) column += character === '\t' ? tabSize - column % tabSize : 1;
  return column - initial;
}

/** Frame attachments replace structural prefixes without changing source or adding lines. */
export function buildBoxes(source: string, regions: CommentRegion[], tabSize = 4): BoxLine[] {
  const result: BoxLine[] = [];
  tabSize = Number.isInteger(tabSize) && tabSize > 0 ? tabSize : 4;
  for (const region of regions) {
    if (region.kind === 'line') continue;
    const firstLineStart = source.lastIndexOf('\n', region.start - 1) + 1;
    const baseline = columns(source.slice(firstLineStart, region.start), tabSize);
    const lineBlock = region.kind === 'lineBlock';
    const closed = lineBlock || source.slice(region.end - 2, region.end) === '*/';
    const lastLineStart = source.lastIndexOf('\n', region.end - 1) + 1;
    const compact = firstLineStart === lastLineStart;
    if (compact && closed && !lineBlock) continue;
    const segments = region.segments.length ? region.segments : [{ start: region.end - (closed ? 2 : 0), end: region.end - (closed ? 2 : 0), markdownStart: 0, markdownEnd: 0 }];
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      const first = index === 0;
      const last = index === segments.length - 1;
      const lineStart = source.lastIndexOf('\n', segment.start - 1) + 1;
      const empty = source.slice(segment.start, segment.end).trim() === '';
      const kind = compact ? 'compact' : first && empty ? 'top' : last && closed && empty ? 'bottom' : 'content';
      const border = kind === 'top' || kind === 'bottom';
      const prefixStart = first ? region.start : lineStart;
      const anchor = border ? (last && closed ? region.end : segment.end) : segment.start;
      const hidden: Span[] = [];
      if (anchor > prefixStart) hidden.push({ start: prefixStart, end: anchor });
      if (!border && last && closed && !lineBlock) {
        // Trim only the conventional space before */; don't consume content or code after it.
        let suffixStart = region.end - 2;
        if (suffixStart > segment.start && source[suffixStart - 1] === ' ') suffixStart--;
        hidden.push({ start: suffixStart, end: region.end });
      }
      result.push({ region, kind, hidden, anchor,
        text: border ? (kind === 'top' ? '┌' : '└') : lineBlock && first ? '┌ ' : lineBlock && last ? '└ ' : '│ ',
        marginColumns: baseline - columns(source.slice(lineStart, anchor), tabSize),
        ...(border || (lineBlock && (first || last)) ? { ruleAnchor: border ? anchor : segment.end } : {}) });
    }
  }
  return result;
}
