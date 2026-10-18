import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { extractComments, mapRange, type Span, type CommentRegion } from './comments';
import { fencedCode, type CodeStyle } from './fenced-code';

export type Style = 'strong' | 'emphasis' | 'inlineCode' | 'delete' | 'heading' | 'marker' | 'horizontalRule' | 'commentText' | 'listMarker' | CodeStyle;
export interface Decoration extends Span { style: Style; region: CommentRegion; label?: string; level?: number }
const processor = unified().use(remarkParse).use(remarkGfm);

/** Small AST-to-range adapter inspired by MIEV; offsets remain UTF-16 throughout. */
export function parseComments(source: string, fileName?: string, regions = extractComments(source, fileName)): Decoration[] {
  const decorations: Decoration[] = [];
  for (const region of regions) {
    const tree = processor.parse(region.markdown);
    function add(style: Style, start: number, end: number, level?: number) {
      for (const span of mapRange(region, { start, end })) decorations.push({ ...span, style, region, ...(level === undefined ? {} : { level }) });
    }
    function walk(node: typeof tree | typeof tree.children[number] | { type: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: unknown[] }, unordered = false) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        if (node.type === 'code') {
          const language = 'lang' in node && typeof node.lang === 'string' ? node.lang : undefined;
          decorations.push(...fencedCode(source, region, { start, end }, language));
        } else if (node.type === 'listItem' && unordered && !('checked' in node && typeof node.checked === 'boolean') && (region.kind === 'lineBlock' || (region.kind === 'block' && region.segments.length > 1))) {
          if (/^[-+*](?=[\t ]|$)/.test(region.markdown.slice(start, end))) add('listMarker', start, start + 1);
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
      if ('children' in node) for (const child of node.children ?? []) walk(child as Parameters<typeof walk>[0], childUnordered);
    }
    walk(tree);
  }
  return decorations;
}
