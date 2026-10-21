import ts from 'typescript';
import { mapRange, type CommentRegion, type Span } from './comments';
import type { Decoration } from './markdown';

export const CODE_STYLES = ['codeBackground', 'codeText', 'codeKeyword', 'codeString', 'codeNumber', 'codeComment', 'codeFence'] as const;
export type CodeStyle = typeof CODE_STYLES[number];
const LANGUAGE_NAMES: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  jsx: 'JavaScript JSX', tsx: 'TypeScript JSX', py: 'Python', python: 'Python',
  json: 'JSON', html: 'HTML', css: 'CSS', sh: 'Shell', bash: 'Bash',
  cpp: 'C++', 'c++': 'C++', c: 'C', cs: 'C#', csharp: 'C#', java: 'Java',
  rb: 'Ruby', ruby: 'Ruby', rs: 'Rust', rust: 'Rust', go: 'Go', sql: 'SQL',
  yaml: 'YAML', yml: 'YAML', md: 'Markdown', markdown: 'Markdown'
};
/**
 * ## codeLanguageName(language) ⇒ {string}
 * Expand familiar fence aliases for readable labels without claiming syntax highlighting exists for every named language.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `language` **{string | null | undefined}** - Markdown fence info language token.
 *
 * ## Returns
 * **{string}** - Known display name, original unknown token, or an empty label.
 *
 * ## Implementation Details
 * Label lookup is intentionally broader than the JS/TS tokenizer; unknown languages still get a plain-code presentation.
 */
export const codeLanguageName = (language?: string | null) => language ? LANGUAGE_NAMES[language.toLowerCase()] ?? language : '';
export const CODE_PALETTES = {
  dark: { background: '#1e1e1e', foreground: '#d4d4d4', keyword: '#569cd6', string: '#ce9178', number: '#b5cea8', comment: '#86b86b' },
  light: { background: '#f5f5f5', foreground: '#24292f', keyword: '#0000ff', string: '#a31515', number: '#087045', comment: '#008000' }
} as const;

/**
 * ## fencedCode(source, region, span, language) ⇒ {Decoration[]}
 * Build contrasting code bands and fence labels while preventing Markdown syntax inside code from being interpreted.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `source` **{string}** - Original document used to protect the closing comment-frame row.
 * - `region` **{CommentRegion}** - Original or quote-normalized mapping for this fence.
 * - `span` **{Span}** - Fenced-code range in normalized Markdown offsets.
 * - `language` **{string | null | undefined}** - Fence language; only JS/TS aliases receive lexical token colors.
 *
 * ## Returns
 * **{Decoration[]}** - Background, disjoint foreground/token ranges and opening/closing fence bars in source coordinates.
 *
 * ## Implementation Details
 * A lightweight scanner avoids language-service dependencies. Plain foreground ranges are subtracted around tokens/fences because Monaco overlap ordering cannot be trusted for color precedence. Empty rows need background anchors even without text.
 *
 * ## Agent Notes
 * Indented Markdown code is intentionally excluded. Keep frame-closing rows, quoted fences, unknown languages and literal Markdown covered independently.
 */
export function fencedCode(source: string, region: CommentRegion, span: Span, language: string | null | undefined): Decoration[] {
  if (region.kind === 'line' || region.segments.length < 2) return [];
  const text = region.markdown.slice(span.start, span.end);
  const opening = /^ {0,3}(`{3,}|~{3,})[^\n]*/.exec(text);
  if (!opening) return [];
  const result: Decoration[] = [];
  /**
   * ## add(style, start, end) ⇒ {void}
   * Route fence/token ranges through the same source mapper as Markdown so removed prefixes cannot acquire code colors.
   *
   * **Kind:** function
   * **Access:** private
   *
   * ## Parameters
   * - `style` **{CodeStyle}** - Semantic code decoration kind.
   * - `start` **{number}** - Inclusive normalized Markdown offset.
   * - `end` **{number}** - Exclusive normalized Markdown offset.
   *
   * ## Returns
   * **{void}** - Appends mapped decorations to the enclosing result.
   *
   * ## Implementation Details
   * Direct source arithmetic across rows would include quote or comment prefixes.
   */
  function add(style: CodeStyle, start: number, end: number) {
    result.push(...mapRange(region, { start, end }).map(range => ({ ...range, style, region })));
  }
  for (const segment of region.segments) {
    if (segment.markdownEnd < span.start || segment.markdownStart > span.end) continue;
    // Don't paint an unclosed fence over the source block's closing-border row.
    if (region.kind === 'block' && source.slice(region.end - 2, region.end) === '*/' &&
        segment === region.segments.at(-1) && region.markdown.slice(segment.markdownStart, segment.markdownEnd).trim() === '') continue;
    const start = Math.max(segment.markdownStart, span.start);
    const end = Math.min(segment.markdownEnd, span.end);
    const sourceStart = segment.start + start - segment.markdownStart;
    const sourceEnd = segment.start + end - segment.markdownStart;
    result.push({ start: sourceStart, end: sourceEnd, style: 'codeBackground', region });
    add('codeText', start, end);
  }
  const marker = opening[1];
  const markerStart = span.start + opening[0].indexOf(marker);
  const openingRanges = mapRange(region, { start: markerStart, end: span.start + opening[0].length });
  result.push(...openingRanges.map(range => ({ ...range, style: 'codeFence' as const, region, label: codeLanguageName(language) })));
  const bodyStart = text.indexOf('\n') < 0 ? span.end : span.start + text.indexOf('\n') + 1;
  const lastLineStart = text.lastIndexOf('\n') + 1;
  const lastLine = text.slice(lastLineStart);
  const closing = /^ {0,3}(`+|~+)[\t ]*$/.exec(lastLine);
  const hasClosing = lastLineStart > 0 && closing && closing[1][0] === marker[0] && closing[1].length >= marker.length;
  const bodyEnd = hasClosing ? span.start + lastLineStart : span.end;
  if (hasClosing) {
    const start = span.start + lastLineStart + closing[0].indexOf(closing[1]);
    add('codeFence', start, start + closing[1].length);
  }
  if (['js', 'javascript', 'ts', 'typescript'].includes(language?.toLowerCase() ?? '')) {
    const body = region.markdown.slice(bodyStart, bodyEnd);
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, body);
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      let style: CodeStyle | undefined;
      if (token >= ts.SyntaxKind.FirstKeyword && token <= ts.SyntaxKind.LastKeyword) style = 'codeKeyword';
      else if (token === ts.SyntaxKind.StringLiteral || token === ts.SyntaxKind.NoSubstitutionTemplateLiteral || token === ts.SyntaxKind.TemplateHead) style = 'codeString';
      else if (token === ts.SyntaxKind.NumericLiteral || token === ts.SyntaxKind.BigIntLiteral) style = 'codeNumber';
      else if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) style = 'codeComment';
      if (style) add(style, bodyStart + scanner.getTokenPos(), bodyStart + scanner.getTextPos());
    }
  }
  // VS Code may resolve overlapping foreground decorations in a different order
  // than their application calls. Keep token/fence foregrounds disjoint from the
  // plain-code foreground rather than relying on CSS precedence.
  const foreground = result.filter(value => value.style !== 'codeText' && value.style !== 'codeBackground').sort((a, b) => a.start - b.start);
  const disjoint = result.filter(value => value.style !== 'codeText');
  let tokenIndex = 0;
  for (const base of result.filter(value => value.style === 'codeText')) {
    let start = base.start;
    while (tokenIndex < foreground.length && foreground[tokenIndex].end <= start) tokenIndex++;
    for (let index = tokenIndex; index < foreground.length && foreground[index].start < base.end; index++) {
      const token = foreground[index];
      if (token.end <= start) continue;
      if (token.start > start) disjoint.push({ ...base, start, end: token.start });
      start = Math.max(start, token.end);
    }
    if (start < base.end) disjoint.push({ ...base, start });
  }
  return disjoint;
}
