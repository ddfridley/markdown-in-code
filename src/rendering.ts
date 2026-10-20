import { parseComments, type Decoration } from './markdown';
import { extractComments, type CommentRegion, type Span } from './comments';
import { buildBoxes, type BoxLine } from './boxes';

/** A caret at the comment's end stays raw for typing; nonempty selections are half-open. */
export function revealsComment(region: CommentRegion, selection: Span): boolean {
  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  return start === end
    ? start >= region.start && start <= region.end
    : start < region.end && end > region.start;
}

/** Session-wide toggle and document-version cache; editor selections remain independent. */
export class RenderingSession {
  private enabled = true;
  private readonly cache = new Map<string, { version: number; fileName: string; decorations: Decoration[]; source: string; regions: CommentRegion[]; boxes: BoxLine[]; tabSize: number }>();

  toggle(): void { this.enabled = !this.enabled; }
  close(uri: string): void { this.cache.delete(uri); }

  decorations(uri: string, version: number, fileName: string, readText: () => string, selections: Span[]): Decoration[] {
    return this.presentation(uri, version, fileName, readText, selections).decorations;
  }

  presentation(uri: string, version: number, fileName: string, readText: () => string, selections: Span[], tabSize = 4, navigation?: Span & { version: number }): { decorations: Decoration[]; boxes: BoxLine[] } {
    if (!this.enabled) return { decorations: [], boxes: [] };
    let cached = this.cache.get(uri);
    if (!cached || cached.version !== version || cached.fileName !== fileName) {
      const source = readText();
      const regions = extractComments(source, fileName);
      cached = { version, fileName, source, regions, decorations: parseComments(source, fileName, regions), boxes: buildBoxes(source, regions, tabSize), tabSize };
      this.cache.set(uri, cached);
    }
    if (cached.tabSize !== tabSize) {
      cached.boxes = buildBoxes(cached.source, cached.regions, tabSize);
      cached.tabSize = tabSize;
    }
    const revealed = new Set<CommentRegion>();
    for (const region of cached.regions) {
      if (navigation?.version === version && navigation.start === region.start && navigation.end === region.end) continue;
      if (selections.some(selection => revealsComment(region, selection))) {
        revealed.add(region);
      }
    }
    return { decorations: cached.decorations.filter(decoration => !revealed.has(decoration.region)), boxes: cached.boxes.filter(box => !revealed.has(box.region)) };
  }
}
