# Headings in comments

ATX headings (`#` through `######`) have six levels. Setext headings use `===` for level 1 and `---` for level 2. Rendered headings hide opening/closing hashes and Setext underlines, while preserving source rows. The underline row remains blank. Multiline Setext titles retain their original rows. Inline bold, italic and code formatting still apply inside titles.

Headings render in multiline block comments and grouped standalone line comments. Lone/trailing line comments, same-line block comments, code and HTML keep their previous literal behavior. Clicking/selecting the comment reveals its source; leaving restores rendering. Toggle, language switching and split-editor selection behavior remain unchanged.

## Typography and row-height decision

VS Code decorations do not offer a supported font-size or per-line-height property. This implementation uses CSS font sizing through `textDecoration`, as other layout features already do. It enlarges glyphs within the existing editor rows; it does not add rows, move the cursor, change source text or modify the user's settings.

The CSS font sizes follow `md-comments` using relative percentages: 150%, 125%, 100%, 95%, 90% and 85%. They inherit the editor font and scale with font settings and zoom; no heading font-size is expressed in pixels. Font weights decrease by level (800, 700, 600, 600, 500, 400), giving smaller headings a lighter density. The requested weight may map to the nearest weight installed for the editor font. Headings are underlined and use the reference extension's neutral light/dark shades; H1 has the strongest contrast. Italics are applied only when present in the Markdown source.

The pixel values below illustrate the computed result for a 16px editor font; the actual CSS uses percentages:

| Level | Relative CSS size / computed example | Weight |
| --- | --- | --- |
| H1 / Setext 1 | 150% / 24px | 800 |
| H2 / Setext 2 | 125% / 20px | 700 |
| H3 | 100% / 16px | 600 |
| H4 | 95% / 15.2px | 600 |
| H5 | 90% / 14.4px | 500 |
| H6 | 85% / 13.6px | 400 |

Row height does not cap the heading scale: H1 remains 150% even when rows are tight. Deliberately small custom line heights can therefore make adjacent headings overlap; the tight-row screenshot records this limitation rather than silently reducing the requested hierarchy. Word wrap does not reduce heading sizes: the full relative hierarchy remains active in every wrap mode. Monaco still calculates wrap points from the editor font, so enlarged text can disagree with those positions. Font-size, line-height and wrap-setting changes refresh decorations without reparsing unchanged source.

Normal editor defaults use platform-specific line-height estimates; unusual fonts may have different glyph bounds. Screenshots cover the pinned font, light/dark themes, narrow/tight layouts, and wrapped titles beside a sidebar/minimap. Existing comment frames draw their left marker per source row, so wrapped continuation rows do not repeat that marker and may have a different inset. Complete wrapped frames, additional fonts, zoom, high contrast and horizontal-scroll visual coverage remain follow-ups. This is an explicit constrained typography implementation, not HTML block layout.

### Wrapping limitation

Headings retain 150%, 125%, 100%, 95%, 90% and 85% with both saved word-wrap settings and temporary Alt+Z overrides. The former size-reduction fallback has been removed because it flattened the requested hierarchy.

Monaco calculates wraps from the base editor font rather than individual decoration sizes. A long enlarged heading can therefore overflow or clip before its source row wraps. This remains a documented limitation; enabling word wrap is not a fix for it. Turning word wrap off avoids soft-wrap disagreement, but long titles may need horizontal scrolling. The extension does not change source, cursor positions or editor line-height settings to compensate.

The public extension API does not expose the effective temporary wrap override. Intercepting built-in commands or independently reflowing source text in CSS is not used. True enlarged-text wrapping needs a separate layout approach.

## Manual checks

Reload the F5 development window and open `tests/fixtures/headings.ts`.

1. Press Ctrl+G, enter `1:1`, and press Enter. Lines 3–9 should show the hierarchy without hashes. The adjacent H1 examples on lines 3 and 4 check overlap; line 4 is the user-added example and must be preserved. H2 is smaller, H3 base size, and H4–H6 progressively smaller/lighter. All are underlined, with neutral theme colors. H1 uses the full 150% size when word wrap is off.
2. Lines 11 and 16 are labeled `Level 1 heading (underlined with ===)` and `Level 2 heading (underlined with ---)`. They should match ATX levels 1 and 2. Their underline rows, 12 and 17, should be blank. The user-added normal text on line 14 should remain gray and base size. Line 19 should retain bold, italic and inline-code presentation without its hashes.
3. Check the fenced code on lines 20–22, the heading on line 23, the horizontal rule on line 25 and the heading on line 26. Their rows and frame edges should stay separate. Lines 29–30 render grouped headings; line 31 keeps its inline-comment source.
4. Click line 3 before `Heading`. The entire block should reveal its Markdown, including both Setext underlines. Return to `1:1` to restore rendering. Toggle rendering off/on to check the same transition.
5. Open `tests/fixtures/headings-wrap.ts`, put the cursor at `1:1`, and enable wrapping through Settings or Alt+Z. H1 must stay 150% and H2 125%. Long-title overflow/clipping is the known limitation described above; wrapping must not silently shrink the headings.

The user approved all screenshots in run `1792271623561`, including heading typography, gray prose and the shown wrapping/tight-row limitations. Those exact images are accepted. Future changes still require separate review; see [the workflow](visual-testing.md).

Ordinary paragraph text in rendered framed comments uses dark gray (#4d4d4d) in light themes and light gray (#a0a0a0) in dark themes. Heading/code foreground ranges are excluded so their own colors remain intact. When editing reveals the source, native syntax coloring returns. The manual fixture was updated only by replacing the two ambiguous example titles; other saved content is preserved.
