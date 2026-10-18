import type { BoxLine } from './boxes';
import type { Decoration } from './markdown';

/** Color rendered prose without overlapping heading, marker or code foregrounds. */
export function commentText(boxes: BoxLine[], decorations: Decoration[]): Decoration[] {
  const result: Decoration[] = [];
  for (const region of new Set(boxes.map(box => box.region))) {
    const excluded = [
      ...decorations.filter(value => value.region === region &&
        (value.style === 'heading' || value.style === 'marker' || value.style === 'listMarker' || value.style === 'horizontalRule' || value.style.startsWith('code'))),
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
