/**
 * ## nativeViewportWidthRules() ⇒ {string}
 * Expose each editor's native input width to its fence decorations through CSS.
 *
 * ## Returns
 * **{string}** - Scoped rules for integer viewport widths from 1 to 4096 CSS pixels.
 *
 * ## Implementation Details
 * The extension host cannot read renderer DOM geometry. CSS size anchors also
 * cannot cross from the fence's containing block to the native input sibling.
 * Matching its inline width lets the browser update an inherited variable when
 * layout changes, without a timer, DOM script or guessed minimap width.
 *
 * ## Agent Notes
 * This bounded lookup is intentionally explicit. Missing elements, fractional or
 * wider widths keep the existing cqw fallback. Do not grow it without measuring
 * stylesheet and layout cost, or mutate the native input to make anchors work.
 */
export function nativeViewportWidthRules(): string {
  return '.monaco-editor:has(&) { --mic-native-viewport-width: initial; } ' +
    Array.from({ length: 4096 }, (_, index) => {
      const width = index + 1;
      return `.monaco-editor:has(&):has(> .overflow-guard > .native-edit-context[style*="width: ${width}px;"]) { --mic-native-viewport-width: ${width}px; }`;
    }).join(' ');
}
