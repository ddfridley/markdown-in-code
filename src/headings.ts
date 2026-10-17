/** Relative typography preserves source rows and never changes editor settings. */
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
