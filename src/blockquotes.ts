import { mapRange, type CommentRegion, type Span } from './comments';
import type { Decoration } from './markdown';

/** Locate a parser-recognized quote's explicit marker on each source row. */
export function quoteMarkers(region: CommentRegion, span: Span, parentDepth: number): Decoration[] {
  const result: Decoration[] = [];
  for (const segment of region.segments) {
    if (segment.markdownEnd <= span.start || segment.markdownStart >= span.end) continue;
    let offset = Math.max(span.start, segment.markdownStart);
    const count = offset === span.start ? 1 : parentDepth + 1;
    for (let depth = 0; depth < count; depth++) {
      const prefix = /^[\t ]*>[\t ]?/.exec(region.markdown.slice(offset, segment.markdownEnd));
      if (!prefix) break; // Lazy continuation rows have no marker to replace.
      const marker = offset + prefix[0].indexOf('>');
      if (depth === count - 1) result.push(...mapRange(region, { start: marker, end: marker + 1 }).map(range => ({ ...range, style: 'quoteMarker' as const, region })));
      offset += prefix[0].length;
    }
  }
  return result;
}

/** Strip quote prefixes for fence parsing while retaining exact source mappings. */
export function quotedFence(region: CommentRegion, span: Span, depth: number): CommentRegion {
  let markdown = '';
  const segments: CommentRegion['segments'] = [];
  for (const segment of region.segments) {
    if (segment.markdownEnd < span.start || segment.markdownStart > span.end) continue;
    let start = Math.max(segment.markdownStart, span.start);
    const end = Math.min(segment.markdownEnd, span.end);
    if (start !== span.start) for (let index = 0; index < depth; index++) {
      const prefix = /^[\t ]*>[\t ]?/.exec(region.markdown.slice(start, end));
      if (!prefix) break;
      start += prefix[0].length;
    }
    if (segments.length) markdown += '\n';
    const sourceStart = segment.start + start - segment.markdownStart;
    segments.push({ start: sourceStart, end: sourceStart + end - start, markdownStart: markdown.length, markdownEnd: markdown.length + end - start });
    markdown += region.markdown.slice(start, end);
  }
  return { ...region, markdown, segments };
}
