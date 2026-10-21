/**
 * ## headingLayout(fontSize, configuredHeight, platform) ⇒ {object}
 * Keep a visible heading hierarchy without changing editor settings or pretending decorations can add source-row height.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `fontSize` **{number}** - Editor base font size in pixels.
 * - `configuredHeight` **{number}** - Editor line-height setting: zero is automatic, small values are multipliers.
 * - `platform` **{string}** - Runtime platform used for the automatic-height approximation.
 *
 * ## Returns
 * **{object}** - Effective `lineHeight` plus six level descriptors containing relative size, measured size, weight, style and theme colors.
 *
 * ## Implementation Details
 * CSS percentages scale the actual heading glyphs; pixel estimates support code-band layout and verification. Wrapping must not flatten heading sizes.
 *
 * ## Agent Notes
 * The scale is a human-approved behavior contract in `tests/contracts/headings.json`. Do not alter expectations or silently reduce sizes to fix overflow.
 */
export function headingLayout(fontSize: number, configuredHeight: number, platform: string) {
  const lineHeight = configuredHeight === 0 ? Math.round(fontSize * (platform === 'linux' ? 1.5 : 1.35))
    : configuredHeight < 8 ? Math.round(fontSize * configuredHeight) : configuredHeight;
  // Preserve the hierarchy regardless of row height or word-wrap mode.
  const levels = [1.5, 1.25, 1, 0.95, 0.9, 0.85].map((factor, index) => ({
    fontSize: Math.round(fontSize * factor * 10) / 10,
    relativeSize: `${Math.round(factor * 100)}%`,
    fontWeight: ['800', '700', '600', '600', '500', '400'][index],
    fontStyle: 'normal',
    lightColor: index === 0 ? '#1a1a1a' : '#333333',
    darkColor: ['#e0e0e0', '#d0d0d0', '#c0c0c0', '#c0c0c0', '#c0c0c0', '#c0c0c0'][index]
  }));
  return { lineHeight, levels };
}
