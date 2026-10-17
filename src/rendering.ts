import { parseComments, type Decoration } from './markdown';
import type { CommentRegion, Span } from './comments';

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
  private readonly cache = new Map<string, { version: number; fileName: string; decorations: Decoration[] }>();

  toggle(): void { this.enabled = !this.enabled; }
  close(uri: string): void { this.cache.delete(uri); }

  decorations(uri: string, version: number, fileName: string, readText: () => string, selections: Span[]): Decoration[] {
    if (!this.enabled) return [];
    let cached = this.cache.get(uri);
    if (!cached || cached.version !== version || cached.fileName !== fileName) {
      cached = { version, fileName, decorations: parseComments(readText(), fileName) };
      this.cache.set(uri, cached);
    }
    const revealed = new Set<CommentRegion>();
    for (const decoration of cached.decorations) {
      if (!revealed.has(decoration.region) && selections.some(selection => revealsComment(decoration.region, selection))) {
        revealed.add(decoration.region);
      }
    }
    return cached.decorations.filter(decoration => !revealed.has(decoration.region));
  }
}
