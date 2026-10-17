import ts from 'typescript';

export interface Span { start: number; end: number }
export interface Segment extends Span { markdownStart: number; markdownEnd: number }
export interface CommentRegion extends Span {
  kind: 'block' | 'line' | 'lineBlock';
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
  const comments: CommentRegion[] = [...ranges.values()].sort((a, b) => a.pos - b.pos).filter(range => {
    while (literalIndex < literalSpans.length && literalSpans[literalIndex].end <= range.pos) literalIndex++;
    const literal = literalSpans[literalIndex];
    return !literal || range.end <= literal.start;
  }).map(range => {
    const block = range.kind === ts.SyntaxKind.MultiLineCommentTrivia;
    const start = range.pos + (block && /^\/\*\*(?:\s|\/)/.test(source.slice(range.pos, range.end)) ? 3 : 2);
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
