import { mapRange, type CommentRegion } from './comments';
import type { Decoration } from './markdown';

interface Node {
  type: string; url?: string; title?: string | null; identifier?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: Node[];
}
interface Definition { url: string; title?: string | null }

/**
 * ## linkDefinitions(tree) ⇒ {Map<string, Definition>}
 * Resolve references within one comment so identically named definitions in other comments cannot leak into it.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `tree` **{Node}** - Parsed Markdown root for one extracted region.
 *
 * ## Returns
 * **{Map<string, Definition>}** - Case-normalized identifiers with the first definition winning.
 *
 * ## Implementation Details
 * The parser supplies Markdown identifier normalization; this pass adds case-insensitive lookup and preserves first-definition precedence.
 *
 * ## Agent Notes
 * Do not cache this map across comments. Visible duplicate definitions may remain individually clickable without changing reference resolution.
 */
export function linkDefinitions(tree: Node): Map<string, Definition> {
  const definitions = new Map<string, Definition>();
  /**
   * ## walk(node) ⇒ {void}
   * Discover definitions regardless of their position in the comment while keeping the first binding stable.
   *
   * **Kind:** function
   * **Access:** private
   *
   * ## Parameters
   * - `node` **{Node}** - Current Markdown node.
   *
   * ## Returns
   * **{void}** - Updates the enclosing definition map.
   *
   * ## Implementation Details
   * References can appear before definitions, so resolution cannot rely on a single forward rendering pass.
   */
  function walk(node: Node) {
    const id = node.identifier?.toUpperCase();
    if (node.type === 'definition' && id && node.url !== undefined && !definitions.has(id)) definitions.set(id, { url: node.url, title: node.title });
    node.children?.forEach(walk);
  }
  walk(tree);
  return definitions;
}

/**
 * ## linkDecorations(node, region, definitions) ⇒ {Decoration[]}
 * Separate readable label styling from full-source activation so hidden link destinations cannot bypass the navigation handler.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `node` **{Node}** - Link, reference, definition or unrelated Markdown node.
 * - `region` **{CommentRegion}** - Source mapping and owning comment.
 * - `definitions` **{Map<string, Definition>}** - Definitions scoped to this comment.
 *
 * ## Returns
 * **{Decoration[]}** - Hidden marker spans and visible link spans with destination/title and activation bounds; unresolved nodes return none.
 *
 * ## Implementation Details
 * Labels may have nested inline formatting or cross source rows. Definition syntax remains visible, but its destination gets native activation too.
 *
 * ## Agent Notes
 * Do not equate a visible label span with its activation span. Parsing must never open a URL or modify the source.
 */
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

/**
 * ## resolveLink(destination, documentUri) ⇒ {object | undefined}
 * Keep destination policy in a pure helper so merely rendering a link cannot open arbitrary URI schemes.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `destination` **{string}** - Markdown target; protocol-relative addresses use HTTPS.
 * - `documentUri` **{string}** - Absolute source-document URI used as the base for relative file links.
 *
 * ## Returns
 * **{{kind: "external" | "editor", uri: string} | undefined}** - Supported resolved target, or no target for malformed/unsupported input.
 *
 * ## Implementation Details
 * Relative paths belong to the source directory, not the workspace root. Web/mail targets open externally; file and relative same-scheme targets remain in the editor.
 *
 * ## Agent Notes
 * Fragment-only heading lookup is not implemented. Keep command/script/data schemes rejected and preserve encoded Windows path tests.
 */
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
