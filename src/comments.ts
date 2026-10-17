import ts from 'typescript';

export interface Span { start: number; end: number }
export interface Segment extends Span { markdownStart: number; markdownEnd: number }
export interface CommentRegion extends Span {
  kind: 'block' | 'line';
  markdown: string;
  segments: Segment[];
}

/** Compiler-derived trivia avoids treating strings, regexes and template text as comments. */
export function extractComments(source: string, fileName = 'source.ts'): CommentRegion[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const ranges = new Map<number, ts.CommentRange>();
  const literalSpans: Span[] = [];
  function collect(rangesToAdd: ts.CommentRange[] | undefined) {
    for (const range of rangesToAdd ?? []) ranges.set(range.pos, range);
  }
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
  return [...ranges.values()].sort((a, b) => a.pos - b.pos).filter(range => {
    while (literalIndex < literalSpans.length && literalSpans[literalIndex].end <= range.pos) literalIndex++;
    const literal = literalSpans[literalIndex];
    return !literal || range.end <= literal.start;
  }).map(range => {
    const block = range.kind === ts.SyntaxKind.MultiLineCommentTrivia;
    const start = range.pos + (block && /^\/\*\*(?:\s|\/)/.test(source.slice(range.pos, range.end)) ? 3 : 2);
    const closed = block && source.slice(range.end - 2, range.end) === '*/';
    const end = closed ? range.end - 2 : range.end;
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
        const prefix = /^[\t ]*\*(?:[\t ]|$)/.exec(source.slice(cursor, contentEnd));
        if (prefix) contentStart += prefix[0].length;
      } else if (source[contentStart] === ' ') contentStart++;
      const text = source.slice(contentStart, contentEnd);
      segments.push({ start: contentStart, end: contentEnd, markdownStart: markdown.length, markdownEnd: markdown.length + text.length });
      markdown += text;
      if (lineEnd === end) break;
      markdown += '\n';
      cursor = lineEnd + 1;
      first = false;
    }
    return { start: range.pos, end: range.end, kind: block ? 'block' : 'line', markdown, segments };
  });
}

/** Split multiline decorations to exclude stripped prefixes, delimiters and line endings. */
export function mapRange(region: CommentRegion, range: Span): Span[] {
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end) ||
      range.start < 0 || range.end > region.markdown.length || range.end <= range.start) return [];
  return region.segments.flatMap(segment => {
    const start = Math.max(range.start, segment.markdownStart);
    const end = Math.min(range.end, segment.markdownEnd);
    return start < end ? [{ start: segment.start + start - segment.markdownStart, end: segment.start + end - segment.markdownStart }] : [];
  });
}
