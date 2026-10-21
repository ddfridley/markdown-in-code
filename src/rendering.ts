import { parseComments, type Decoration } from './markdown';
import { extractComments, type CommentRegion, type Span } from './comments';
import { buildBoxes, type BoxLine } from './boxes';

/**
 * ## revealsComment(region, selection) ⇒ {boolean}
 * Keep typing at a comment end in raw mode while treating nonempty selections as half-open ranges.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `region` **{CommentRegion}** - Compiler-derived source comment bounds.
 * - `selection` **{Span}** - Source offsets; reversed endpoints are normalized.
 *
 * ## Returns
 * **{boolean}** - Whether the caret/selection ordinarily reveals this comment.
 *
 * ## Implementation Details
 * Caret-at-end inclusion is intentional for editing line comments. Applying the same rule to nonempty selections would reveal the next comment at a boundary.
 */
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

  /**
   * ## toggle() ⇒ {void}
   * Switch rendering session-wide while retaining reusable versioned parse data.
   *
   * **Kind:** method
   * **Access:** public
   *
   * ## Parameters
   * None.
   *
   * ## Returns
   * **{void}** - Flips the session enable flag.
   *
   * ## Implementation Details
   * Visibility is recalculated by the editor adapter; toggling should not reparse unchanged documents or mutate their text.
   */
  toggle(): void { this.enabled = !this.enabled; }
  /**
   * ## isEnabled ⇒ {boolean}
   * Expose rendering policy without requiring commands to infer it from an empty decoration result.
   *
   * **Kind:** getter
   * **Access:** public
   *
   * ## Parameters
   * None.
   *
   * ## Returns
   * **{boolean}** - Current global rendering enable flag.
   *
   * ## Implementation Details
   * Escape must not implicitly enable rendering when the user has toggled it off.
   */
  get isEnabled(): boolean { return this.enabled; }
  /**
   * ## close(uri) ⇒ {void}
   * Release a document cache entry when its lifecycle ends, rather than retaining full source indefinitely.
   *
   * **Kind:** method
   * **Access:** public
   *
   * ## Parameters
   * - `uri` **{string}** - Same document cache key used for presentation.
   *
   * ## Returns
   * **{void}** - Deletes that entry if present.
   *
   * ## Implementation Details
   * Closing an editor tab and disposing a document are different VS Code events; the adapter chooses when this cleanup runs.
   */
  close(uri: string): void { this.cache.delete(uri); }

  /**
   * ## decorations(uri, version, fileName, readText, selections) ⇒ {Decoration[]}
   * Keep a semantic-only facade for callers that do not need frame plans.
   *
   * **Kind:** method
   * **Access:** public
   *
   * ## Parameters
   * - `uri` **{string}** - Document cache key.
   * - `version` **{number}** - Source version used for invalidation.
   * - `fileName` **{string}** - Compiler language context.
   * - `readText` **{() => string}** - Lazy source reader, called on cache misses.
   * - `selections` **{Span[]}** - This editor view's source selections.
   *
   * ## Returns
   * **{Decoration[]}** - Visible semantic decorations from the shared presentation path.
   *
   * ## Implementation Details
   * Delegation avoids a second selection/toggle implementation drifting from framed rendering.
   */
  decorations(uri: string, version: number, fileName: string, readText: () => string, selections: Span[]): Decoration[] {
    return this.presentation(uri, version, fileName, readText, selections).decorations;
  }

  /**
   * ## presentation(uri, version, fileName, readText, selections, tabSize, navigation) ⇒ {object}
   * Share parsing across views while keeping source reveal dependent on each editor's own selections and explicit rendering protection.
   *
   * **Kind:** method
   * **Access:** public
   *
   * ## Parameters
   * - `uri` **{string}** - Document cache key.
   * - `version` **{number}** - Source version; must change when source changes.
   * - `fileName` **{string}** - Compiler context, also part of cache validity.
   * - `readText` **{() => string}** - Source reader evaluated only for a new cache entry.
   * - `selections` **{Span[]}** - Source selections for one editor, not all splits.
   * - `tabSize` **{number}** *(optional)* - Frame tab-stop width; defaults to four.
   * - `navigation` **{Span & {version: number} | undefined}** - One version-bound region protected by native navigation or Escape.
   *
   * ## Returns
   * **{{decorations: Decoration[], boxes: BoxLine[]}}** - Visible semantic spans and frames, or empty arrays while disabled.
   *
   * ## Implementation Details
   * Cached region object identity ties styles and frames together. A tab-size-only change rebuilds frames without discarding parsing. Protection is passed per call so one split cannot force another split rendered.
   *
   * ## Agent Notes
   * Do not move editor-specific state into this URI cache. Stale protection must not apply after a version change; independent tests cover this contract.
   */
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
