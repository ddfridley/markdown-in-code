import { mapRange, type CommentRegion, type Span } from './comments';
import type { Decoration } from './markdown';

/**
 * ## quoteMarkers(region, span, parentDepth) ⇒ {Decoration[]}
 * Replace only explicit quote markers so lazy continuation text does not gain invented quote syntax.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `region` **{CommentRegion}** - Extracted comment mapping.
 * - `span` **{Span}** - Parser quote range in normalized Markdown offsets.
 * - `parentDepth` **{number}** - Number of enclosing blockquotes before this node.
 *
 * ## Returns
 * **{Decoration[]}** - Source-mapped `quoteMarker` spans for this nesting level.
 *
 * ## Implementation Details
 * Nested AST nodes overlap; emitting only this level avoids duplicate bars on the same marker.
 *
 * ## Agent Notes
 * Keep replacement bars disjoint from foreground/hidden-marker spans in the final parser pass.
 */
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

/**
 * ## quotedFence(region, span, depth) ⇒ {CommentRegion}
 * Give the fence parser quote-free text while preserving the original source positions of its code.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `region` **{CommentRegion}** - Original extracted comment.
 * - `span` **{Span}** - Fenced-code node offsets in that region.
 * - `depth` **{number}** - Quote prefixes to remove from continuation rows.
 *
 * ## Returns
 * **{CommentRegion}** - A derived region with rewritten Markdown/segments and unchanged outer source bounds.
 *
 * ## Implementation Details
 * Without normalization, quote prefixes become code text and the contrasting code band covers quote bars.
 *
 * ## Agent Notes
 * Fence decorations must be reassociated with the original region after parsing, or selection reveal will not match the cached region identity.
 */
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
