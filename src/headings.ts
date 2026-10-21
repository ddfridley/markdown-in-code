/**
 * ## headingLayout(fontSize, configuredHeight, platform, fontFitAllowance) ⇒ {object}
 * Keep a visible heading hierarchy without changing editor settings or pretending decorations can add source-row height.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `fontSize` **{number}** - Editor base font size in pixels.
 * - `configuredHeight` **{number}** - Editor line-height setting: zero is automatic, small values are multipliers.
 * - `platform` **{string}** - Runtime platform used for the automatic-height approximation.
 * - `fontFitAllowance` **{number}** *(optional)* - Positive user-calibrated ink-fit multiplier; defaults to the user calibration producing 164% H1 at 14px/19px.
 *
 * ## Returns
 * **{object}** - Effective `lineHeight` plus six level descriptors containing relative size, measured size, weight, style and theme colors.
 *
 * ## Implementation Details
 * CSS percentages scale the actual heading glyphs; pixel estimates support code-band layout and verification. Wrapping must not flatten heading sizes.
 *
 * ## Agent Notes
 * The line-height equation and level proportions are a human-approved behavior contract in `tests/contracts/headings.json`. Wrap must not independently flatten the hierarchy. Automatic line height is an estimate, not a public editor measurement API.
 */
export function headingLayout(fontSize: number, configuredHeight: number, platform: string, fontFitAllowance = 1.208421) {
  const lineHeight = configuredHeight === 0 ? Math.round(fontSize * (platform === 'linux' ? 1.5 : 1.35))
    : configuredHeight < 8 ? Math.round(fontSize * configuredHeight) : configuredHeight;
  // Calibrated at 14px/19px; row height now sets the budget. This allowance
  // represents user calibration, not measured glyph bounds for every font.
  const allowance = Number.isFinite(fontFitAllowance) && fontFitAllowance > 0 ? fontFitAllowance : 1.208421;
  const scale = lineHeight / fontSize * allowance / 1.64;
  const levels = [1.64, 1.37, 1.09, 1.04, 0.98, 0.93].map((ratio, index) => {
    const factor = ratio * scale;
    return {
    fontSize: Math.round(fontSize * factor * 10) / 10,
    relativeSize: `${Math.round(factor * 100)}%`,
    fontWeight: ['800', '700', '600', '600', '500', '400'][index],
    fontStyle: 'normal',
    lightColor: index === 0 ? '#1a1a1a' : '#333333',
    darkColor: ['#e0e0e0', '#d0d0d0', '#c0c0c0', '#c0c0c0', '#c0c0c0', '#c0c0c0'][index]
    };
  });
  return { lineHeight, levels };
}
