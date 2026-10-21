import type { BoxLine } from './boxes';
import type { Decoration } from './markdown';

/**
 * ## commentText(boxes, decorations) ⇒ {Decoration[]}
 * Apply neutral prose colors without overriding link, heading, frame or code presentation.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `boxes` **{BoxLine[]}** - Visible frame plans, which identify eligible comment regions.
 * - `decorations` **{Decoration[]}** - Already-filtered semantic decorations for the editor.
 *
 * ## Returns
 * **{Decoration[]}** - Uncovered source-text spans using the `commentText` style.
 *
 * ## Implementation Details
 * Monaco foreground overlap order is not a semantic cascade. Subtracting protected spans avoids prose colors winning over more specific styles.
 *
 * ## Agent Notes
 * When adding a foreground-bearing style, review this exclusion list. Region identity connects frames and semantic ranges; matching by text is unsafe.
 */
export function commentText(boxes: BoxLine[], decorations: Decoration[]): Decoration[] {
  const result: Decoration[] = [];
  for (const region of new Set(boxes.map(box => box.region))) {
    const excluded = [
      ...decorations.filter(value => value.region === region &&
        (value.style === 'heading' || value.style === 'marker' || value.style === 'listMarker' || value.style === 'orderedMarker' || value.style === 'taskMarker' || value.style === 'quoteMarker' || value.style === 'link' || value.style.startsWith('table') || value.style === 'horizontalRule' || value.style.startsWith('code'))),
      ...boxes.filter(box => box.region === region).flatMap(box => box.hidden)
    ].sort((a, b) => a.start - b.start);
    for (const segment of region.segments) {
      let start = segment.start;
      for (const range of excluded) {
        if (range.end <= start) continue;
        if (range.start >= segment.end) break;
        if (range.start > start) result.push({ start, end: range.start, style: 'commentText', region });
        start = Math.max(start, range.end);
      }
      if (start < segment.end) result.push({ start, end: segment.end, style: 'commentText', region });
    }
  }
  return result;
}
