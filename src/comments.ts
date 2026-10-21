import ts from 'typescript';

export interface Span { start: number; end: number }
export interface Segment extends Span { markdownStart: number; markdownEnd: number }
export interface CommentRegion extends Span {
  kind: 'block' | 'line' | 'lineBlock';
  markdown: string;
  segments: Segment[];
}

/**
 * ## extractComments(source, fileName) ⇒ {CommentRegion[]}
 * Find compiler-recognized comments and prepare Markdown input without losing its original source coordinates.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `source` **{string}** - Complete, unmodified document text.
 * - `fileName` **{string}** *(optional)* - Compiler parsing context; defaults to `source.ts`, including JSX/TSX recognition when appropriate.
 *
 * ## Returns
 * **{CommentRegion[]}** - Ordered comment regions with normalized Markdown and per-row UTF-16 source mappings.
 *
 * ## Implementation Details
 * Trivia helpers alone can report comment-like text inside literals. Compiler traversal supplies exclusion spans; prefix normalization preserves meaningful indentation and fence contents. Adjacent standalone line comments are grouped only when intervening source is whitespace on the next row.
 *
 * ## Agent Notes
 * Keep source offsets and normalized Markdown offsets distinct. Do not replace compiler recognition with a comment regex. Preserve LF/CRLF, literal-context and prefix-ambiguity cases in `tests/adapter.test.ts`.
 */
export function extractComments(source: string, fileName = 'source.ts'): CommentRegion[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const ranges = new Map<number, ts.CommentRange>();
  const literalSpans: Span[] = [];
  /**
   * ## collect(rangesToAdd) ⇒ {void}
   * Deduplicate trivia discovered through overlapping compiler nodes so each source comment is normalized once.
   *
   * **Kind:** function
   * **Access:** private
   *
   * ## Parameters
   * - `rangesToAdd` **{ts.CommentRange[] | undefined}** - Leading or trailing trivia returned by a compiler helper.
   *
   * ## Returns
   * **{void}** - Updates the enclosing map keyed by source start offset.
   *
   * ## Implementation Details
   * The same comment can be discovered from several syntax nodes. Source-position keys prevent duplicate regions and decorations.
   */
  function collect(rangesToAdd: ts.CommentRange[] | undefined) {
    for (const range of rangesToAdd ?? []) ranges.set(range.pos, range);
  }
  /**
   * ## walk(node) ⇒ {void}
   * Collect literal exclusions alongside trivia because the trivia helpers are not syntax-context aware.
   *
   * **Kind:** function
   * **Access:** private
   *
   * ## Parameters
   * - `node` **{ts.Node}** - Current node in the source file created by the enclosing extraction call.
   *
   * ## Returns
   * **{void}** - Adds literal spans and candidate comments to enclosing collections.
   *
   * ## Implementation Details
   * Using compiler children preserves template-expression comments while excluding template text, strings, regular expressions and JSX text.
   */
  function walk(node: ts.Node) {
    if (ts.isStringLiteralLike(node) || ts.isRegularExpressionLiteral(node) ||
        ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
      literalSpans.push({ start: node.getStart(file), end: node.end });
    }
    collect(ts.getLeadingCommentRanges(source, node.getFullStart()));
    collect(ts.getTrailingCommentRanges(source, node.end));
    for (const child of node.getChildren(file)) walk(child);
  }
  walk(file);
  // Trivia helpers are context-free: reject candidates in literal/JSX text explicitly.
  literalSpans.sort((a, b) => a.start - b.start);
  let literalIndex = 0;
  const comments: CommentRegion[] = [...ranges.values()].sort((a, b) => a.pos - b.pos).filter(range => {
    while (literalIndex < literalSpans.length && literalSpans[literalIndex].end <= range.pos) literalIndex++;
    const literal = literalSpans[literalIndex];
    return !literal || range.end <= literal.start;
  }).map(range => {
    const block = range.kind === ts.SyntaxKind.MultiLineCommentTrivia;
    // Extra stars on a delimiter-only opening row are decorative syntax, not
    // Markdown content. Restrict this to an otherwise empty row so inline
    // emphasis (for example /* **bold** */) retains its original mapping.
    const openingStars = block ? /^\/\*{2,}(?=[\t ]*\r?(?:\n|$))/.exec(source.slice(range.pos, range.end)) : null;
    const start = range.pos + (openingStars?.[0].length ?? (block && /^\/\*\*(?:\s|\/)/.test(source.slice(range.pos, range.end)) ? 3 : 2));
    const closed = block && source.slice(range.end - 2, range.end) === '*/';
    const end = closed ? range.end - 2 : range.end;
    const openingLineStart = source.lastIndexOf('\n', range.pos - 1) + 1;
    const baseIndent = /^[\t ]*/.exec(source.slice(openingLineStart, range.pos))![0];
    const relativeLines = source.slice(start, end).split('\n').slice(1).map(line => line.startsWith(baseIndent) ? line.slice(baseIndent.length) : line);
    const starPrefixed = block && (start === range.pos + 3 || relativeLines.some(line => /^[\t ]+\*(?:[\t ]|\r?$)/.test(line)));
    let fence: { marker: string; length: number } | undefined;
    const segments: Segment[] = [];
    let markdown = '';
    let cursor = start;
    let first = true;
    while (cursor <= end) {
      const newline = source.indexOf('\n', cursor);
      const lineEnd = newline < 0 || newline >= end ? end : newline;
      const contentEnd = lineEnd > cursor && source[lineEnd - 1] === '\r' ? lineEnd - 1 : lineEnd;
      let contentStart = cursor;
      if (block && !first) {
        // Strip conventional JSDoc prefixes only; preserve indentation after the prefix.
        const line = source.slice(cursor, contentEnd);
        const relativeLine = line.startsWith(baseIndent) ? line.slice(baseIndent.length) : line;
        const prefix = (starPrefixed ? /^[\t ]*\*(?:[\t ]|$)/.exec(line) : null)
          ?? (!fence && !/^(?: {4}|\t)/.test(relativeLine) ? /^[\t ]*\/\/(?: ?)/.exec(line) : null);
        if (prefix) contentStart += prefix[0].length;
        else if (line.startsWith(baseIndent)) contentStart += baseIndent.length;
      } else if (source[contentStart] === ' ') contentStart++;
      const text = source.slice(contentStart, contentEnd);
      const fenceMarker = /^ {0,3}(`{3,}|~{3,})/.exec(text);
      if (fenceMarker) {
        const run = fenceMarker[1];
        if (!fence) fence = { marker: run[0], length: run.length };
        else if (run[0] === fence.marker && run.length >= fence.length && text.slice(fenceMarker[0].length).trim() === '') fence = undefined;
      }
      segments.push({ start: contentStart, end: contentEnd, markdownStart: markdown.length, markdownEnd: markdown.length + text.length });
      markdown += text;
      if (lineEnd === end) break;
      markdown += '\n';
      cursor = lineEnd + 1;
      first = false;
    }
    return { start: range.pos, end: range.end, kind: block ? 'block' : 'line', markdown, segments };
  });
  const grouped: CommentRegion[] = [];
  /**
   * ## standalone(region) ⇒ {boolean}
   * Distinguish comment-only rows from trailing comments so grouping cannot swallow surrounding code.
   *
   * **Kind:** function
   * **Access:** private
   *
   * ## Parameters
   * - `region` **{CommentRegion}** - Candidate compiler-derived comment.
   *
   * ## Returns
   * **{boolean}** - True only for a line comment preceded solely by indentation on its source row.
   *
   * ## Implementation Details
   * Grouping is a presentation decision, not a reason to reinterpret a trailing comment as a block.
   */
  const standalone = (region: CommentRegion) => region.kind === 'line' && /^[\t ]*$/.test(source.slice(source.lastIndexOf('\n', region.start - 1) + 1, region.start));
  for (let index = 0; index < comments.length; index++) {
    const first = comments[index];
    if (!standalone(first)) { grouped.push(first); continue; }
    const run = [first];
    while (index + 1 < comments.length && standalone(comments[index + 1]) &&
      /^\r?\n[\t ]*$/.test(source.slice(comments[index].end, comments[index + 1].start))) {
      run.push(comments[++index]);
    }
    if (run.length === 1) { grouped.push(first); continue; }
    let markdown = '';
    const segments: Segment[] = [];
    for (const region of run) {
      if (segments.length) markdown += '\n';
      const offset = markdown.length;
      segments.push(...region.segments.map(segment => ({ ...segment, markdownStart: segment.markdownStart + offset, markdownEnd: segment.markdownEnd + offset })));
      markdown += region.markdown;
    }
    grouped.push({ start: first.start, end: run.at(-1)!.end, kind: 'lineBlock', markdown, segments });
  }
  return grouped;
}

/**
 * ## mapRange(region, range) ⇒ {Span[]}
 * Translate a Markdown range into disjoint source spans so styling never covers stripped comment prefixes or line endings.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `region` **{CommentRegion}** - Extracted region and its segment mapping.
 * - `range` **{Span}** - Half-open UTF-16 offsets in `region.markdown`, not in the original document.
 *
 * ## Returns
 * **{Span[]}** - Nonempty source spans; invalid, out-of-bounds and zero-width inputs return an empty array.
 *
 * ## Implementation Details
 * One logical Markdown node may cross rows with removed prefixes. A single source range would accidentally style those prefixes.
 *
 * ## Agent Notes
 * Zero-width table attachments intentionally use their own anchor mapping. Do not broaden this mapper to include delimiters or CRLF bytes.
 */
export function mapRange(region: CommentRegion, range: Span): Span[] {
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end) ||
      range.start < 0 || range.end > region.markdown.length || range.end <= range.start) return [];
  return region.segments.flatMap(segment => {
    const start = Math.max(range.start, segment.markdownStart);
    const end = Math.min(range.end, segment.markdownEnd);
    return start < end ? [{ start: segment.start + start - segment.markdownStart, end: segment.start + end - segment.markdownStart }] : [];
  });
}
