import { mapRange, type CommentRegion } from './comments';
import type { Decoration } from './markdown';

interface Node {
  type: string; url?: string; title?: string | null; identifier?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: Node[];
}
interface Definition { url: string; title?: string | null }

export function linkDefinitions(tree: Node): Map<string, Definition> {
  const definitions = new Map<string, Definition>();
  function walk(node: Node) {
    const id = node.identifier?.toUpperCase();
    if (node.type === 'definition' && id && node.url !== undefined && !definitions.has(id)) definitions.set(id, { url: node.url, title: node.title });
    node.children?.forEach(walk);
  }
  walk(tree);
  return definitions;
}

export function linkDecorations(node: Node, region: CommentRegion, definitions: Map<string, Definition>): Decoration[] {
  if (node.type === 'definition' && node.url !== undefined && node.position?.start.offset !== undefined && node.position.end.offset !== undefined) {
    const start = node.position.start.offset;
    const text = region.markdown.slice(start, node.position.end.offset);
    const match = /^\s*\[(?:\\.|[^\]])+\]:\s*(?:<([^>\n]*)>|(\S+))/.exec(text);
    if (!match) return [];
    const raw = match[1] ?? match[2];
    const offset = start + match[0].lastIndexOf(raw);
    return mapRange(region, { start: offset, end: offset + raw.length }).map(span => ({ ...span, style: 'link' as const, region, destination: node.url, title: node.title ?? undefined, activation: span }));
  }
  if (node.type !== 'link' && node.type !== 'linkReference') return [];
  const target = node.type === 'link' ? node : definitions.get(node.identifier?.toUpperCase() ?? '');
  const start = node.position?.start.offset, end = node.position?.end.offset;
  const labelStart = node.children?.[0]?.position?.start.offset;
  const labelEnd = node.children?.at(-1)?.position?.end.offset;
  if (target?.url === undefined || start === undefined || end === undefined || labelStart === undefined || labelEnd === undefined) return [];
  const full = mapRange(region, { start, end });
  if (!full.length) return [];
  const activation = { start: full[0].start, end: full.at(-1)!.end };
  return [
    ...mapRange(region, { start, end: labelStart }).map(span => ({ ...span, style: 'marker' as const, region })),
    ...mapRange(region, { start: labelStart, end: labelEnd }).map(span => ({ ...span, style: 'link' as const, region, destination: target.url, title: target.title ?? undefined, activation })),
    ...mapRange(region, { start: labelEnd, end }).map(span => ({ ...span, style: 'marker' as const, region }))
  ];
}

/** Resolve explicit activation only; parsing and rendering never open a target. */
export function resolveLink(destination: string, documentUri: string): { kind: 'external' | 'editor'; uri: string } | undefined {
  if (!destination || destination.startsWith('#')) return undefined;
  try {
    const uri = new URL(destination.startsWith('//') ? `https:${destination}` : destination, documentUri);
    if (['http:', 'https:', 'mailto:'].includes(uri.protocol)) return { kind: 'external', uri: uri.href };
    const absoluteScheme = /^[a-z][a-z\d+.-]*:/i.test(destination);
    if (uri.protocol === 'file:' || (!absoluteScheme && uri.protocol === new URL(documentUri).protocol)) return { kind: 'editor', uri: uri.href };
  } catch { /* Malformed targets remain editable source. */ }
  return undefined;
}
