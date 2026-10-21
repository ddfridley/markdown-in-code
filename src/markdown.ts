import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { extractComments, mapRange, type Span, type CommentRegion } from './comments';
import { fencedCode, type CodeStyle } from './fenced-code';
import { quoteMarkers, quotedFence } from './blockquotes';
import { linkDecorations, linkDefinitions } from './links';
import { tableDecorations } from './tables';

export type Style = 'strong' | 'emphasis' | 'inlineCode' | 'delete' | 'heading' | 'marker' | 'horizontalRule' | 'commentText' | 'listMarker' | 'orderedMarker' | 'taskMarker' | 'quoteMarker' | 'link' | 'tableGap' | 'tableHeader' | 'tableRow' | 'tableRowHeader' | CodeStyle;
export interface Decoration extends Span { style: Style; region: CommentRegion; label?: string; level?: number; destination?: string; title?: string; activation?: Span }
const processor = unified().use(remarkParse).use(remarkGfm);

/**
 * ## parseComments(source, fileName, regions) ⇒ {Decoration[]}
 * Adapt comment-local Markdown ASTs into source decorations without touching code outside compiler-recognized comments.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `source` **{string}** - Complete document text.
 * - `fileName` **{string | undefined}** - Parsing context for comment extraction.
 * - `regions` **{CommentRegion[]}** *(optional)* - Pre-extracted regions; reuse them when sharing frame/cache identity.
 *
 * ## Returns
 * **{Decoration[]}** - Source-coordinate semantic spans, marker hiding, labels and link metadata.
 *
 * ## Implementation Details
 * Each comment is a separate Markdown document. Tables run after inline parsing so hidden markers inform cell widths. Quote-marker subtraction prevents multiline styles from painting replacement bars.
 *
 * ## Agent Notes
 * Keep code/HTML/image literal contexts intact. AST positions are normalized Markdown offsets until passed through mapping; the original source remains authoritative.
 */
export function parseComments(source: string, fileName?: string, regions = extractComments(source, fileName)): Decoration[] {
  const decorations: Decoration[] = [];
  for (const region of regions) {
    const tree = processor.parse(region.markdown);
    const definitions = linkDefinitions(tree);
    const tables: Parameters<typeof tableDecorations>[0][] = [];
    /**
     * ## add(style, start, end, level) ⇒ {void}
     * Centralize range conversion so ordinary Markdown styles obey the same source-boundary contract.
     *
     * **Kind:** function
     * **Access:** private
     *
     * ## Parameters
     * - `style` **{Style}** - Semantic decoration kind.
     * - `start` **{number}** - Inclusive normalized Markdown offset.
     * - `end` **{number}** - Exclusive normalized Markdown offset.
     * - `level` **{number | undefined}** - Optional heading depth.
     *
     * ## Returns
     * **{void}** - Appends mapped decorations for the current region.
     *
     * ## Implementation Details
     * Multiline nodes need separate source spans rather than one range spanning removed prefixes.
     */
    function add(style: Style, start: number, end: number, level?: number) {
      for (const span of mapRange(region, { start, end })) decorations.push({ ...span, style, region, ...(level === undefined ? {} : { level }) });
    }
    /**
     * ## walk(node, unordered, ordinal, quoteDepth) ⇒ {void}
     * Carry block context through the AST so nested lists, quote markers and fences compose without guessing from source text alone.
     *
     * **Kind:** function
     * **Access:** private
     *
     * ## Parameters
     * - `node` **{Node}** - Current Markdown node.
     * - `unordered` **{boolean}** *(optional)* - Current list-marker policy; defaults to false.
     * - `ordinal` **{number | undefined}** - Computed ordered-list item number.
     * - `quoteDepth` **{number}** *(optional)* - Enclosing quote depth; defaults to zero.
     *
     * ## Returns
     * **{void}** - Adds current-region styles and records tables for the later layout pass.
     *
     * ## Implementation Details
     * The AST distinguishes thematic breaks, Setext headings, tasks and literal contexts that share punctuation. Ordered presentation uses list start plus item index, not arbitrary source numbering.
     *
     * ## Agent Notes
     * Preserve the no-Markdown-inside-code/HTML behavior and normalize quoted fences before tokenizing them.
     */
    function walk(node: Parameters<typeof linkDecorations>[0], unordered = false, ordinal?: number, quoteDepth = 0) {
      if (node.type === 'table') tables.push(node);
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        decorations.push(...linkDecorations(node, region, definitions));
        if (node.type === 'blockquote' && (region.kind === 'lineBlock' || (region.kind === 'block' && region.segments.length > 1))) {
          decorations.push(...quoteMarkers(region, { start, end }, quoteDepth));
        } else if (node.type === 'code') {
          const language = 'lang' in node && typeof node.lang === 'string' ? node.lang : undefined;
          if (quoteDepth) {
            const normalized = quotedFence(region, { start, end }, quoteDepth);
            decorations.push(...fencedCode(source, normalized, { start: 0, end: normalized.markdown.length }, language).map(value => ({ ...value, region })));
          } else decorations.push(...fencedCode(source, region, { start, end }, language));
        } else if (node.type === 'listItem' && (region.kind === 'lineBlock' || (region.kind === 'block' && region.segments.length > 1))) {
          const text = region.markdown.slice(start, end);
          const marker = /^(?:[-+*]|\d{1,9}[.)])(?=[\t ]|$)/.exec(text);
          if (marker) {
            const task = 'checked' in node && typeof node.checked === 'boolean'
              ? /^(?:[-+*]|\d{1,9}[.)])[\t ]+\[[ xX]\]/.exec(text) : null;
            if (task) {
              const taskStart = unordered ? start : start + task[0].indexOf('[');
              if (!unordered && ordinal !== undefined) {
                for (const span of mapRange(region, { start, end: start + marker[0].length })) decorations.push({ ...span, style: 'orderedMarker', region, label: `${ordinal}.` });
              }
              for (const span of mapRange(region, { start: taskStart, end: taskStart + 1 })) decorations.push({ ...span, style: 'taskMarker', region, label: 'checked' in node && node.checked ? '☑' : '☐' });
              add('marker', taskStart + 1, start + task[0].length);
            } else if (unordered) add('listMarker', start, start + 1);
            else if (ordinal !== undefined) {
              for (const span of mapRange(region, { start, end: start + marker[0].length })) decorations.push({ ...span, style: 'orderedMarker', region, label: `${ordinal}.` });
            }
          }
        } else if (node.type === 'thematicBreak' && (region.kind === 'lineBlock' || (region.kind === 'block' && region.segments.length > 1))) {
          add('horizontalRule', start, end);
        } else if (node.type === 'strong' || node.type === 'emphasis' || node.type === 'delete') {
          const width = node.type === 'emphasis' ? 1 : node.type === 'delete'
            ? /^~+/.exec(region.markdown.slice(start, end))![0].length : 2;
          add(node.type, start + width, end - width);
          add('marker', start, start + width);
          add('marker', end - width, end);
        } else if (node.type === 'inlineCode') {
          const width = /^`+/.exec(region.markdown.slice(start, end))?.[0].length ?? 1;
          add('inlineCode', start + width, end - width);
          add('marker', start, start + width);
          add('marker', end - width, end);
        } else if (node.type === 'heading' && (region.kind === 'lineBlock' || (region.kind === 'block' && region.segments.length > 1))) {
          const text = region.markdown.slice(start, end);
          const level = 'depth' in node && typeof node.depth === 'number' ? node.depth : 1;
          const opening = /^ {0,3}#{1,6}(?:[\t ]+|$)/.exec(text);
          if (opening) {
            const contentStart = start + opening[0].length;
            const closing = /[\t ]+#+[\t ]*$/.exec(text.slice(opening[0].length));
            const contentEnd = closing ? contentStart + closing.index : end;
            add('marker', start, contentStart);
            add('heading', contentStart, contentEnd, level);
            if (closing) add('marker', contentEnd, end);
          } else {
            const underline = text.lastIndexOf('\n');
            const titleEnd = start + text.slice(0, underline).trimEnd().length;
            add('heading', start, titleEnd, level);
            add('marker', start + underline + 1, end);
          }
        }
      }
      // Code and HTML nodes have no Markdown children: never style Markdown inside them.
      const childUnordered = node.type === 'list' ? 'ordered' in node && node.ordered === false : unordered;
      if ('children' in node) (node.children ?? []).forEach((child, index) => walk(child as Parameters<typeof walk>[0], childUnordered,
        node.type === 'list' && 'ordered' in node && node.ordered === true ? (('start' in node && typeof node.start === 'number' ? node.start : 1) + index) : undefined,
        quoteDepth + (node.type === 'blockquote' ? 1 : 0)));
    }
    walk(tree);
    for (const table of tables) decorations.push(...tableDecorations(table, region, decorations));
  }
  // Multiline Markdown spans include explicit quote prefixes in their offsets.
  // Keep their formatting/hidden markers from covering the replacement bars.
  const quotes = decorations.filter(value => value.style === 'quoteMarker').sort((a, b) => a.start - b.start);
  return decorations.flatMap(value => {
    if (value.style === 'quoteMarker' || value.style === 'codeBackground' || value.start === value.end) return [value];
    const result: Decoration[] = [];
    let start = value.start;
    for (const quote of quotes) {
      if (quote.end <= start) continue;
      if (quote.start >= value.end) break;
      if (quote.start > start) result.push({ ...value, start, end: quote.start });
      start = quote.end;
    }
    if (start < value.end) result.push({ ...value, start });
    return result;
  });
}
