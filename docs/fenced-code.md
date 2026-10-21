# Fenced code in comments

Fenced code inside multiline block comments and grouped standalone `//` comments uses a dark code band in light editor themes, and a light band in dark themes. Blank code rows retain the background. Each row uses a single full-height background layer, avoiding seams at text ends and beneath hidden fence markers. The band continues to the viewport's right edge within the existing comment frame.

Backtick and tilde fences become horizontal bars in the code palette. The opening bar has a centered language label, expanding known aliases such as `js` to `JavaScript` and `ts` to `TypeScript`. Unknown labels stay as written; absent labels produce an unlabeled bar. The closing bar has no label. Opening-fence metadata hides with the source fence. Markdown-looking code stays literal. Clicking or selecting the comment reveals its complete source, and leaving restores rendering. The global toggle and split-editor reveal behavior also apply. Rendering never changes source text.

Bar positioning uses CSS through decoration attachments. Where available, labels use the width of that editor's `native-edit-context`, which remains narrow when oversized headings expand the text layer. An editor-scoped CSS lookup transfers integer inline widths from 1–4096 CSS pixels into an inherited variable; resizing updates the match without a timer or renderer script. Each split uses its own native input. The native width already excludes the scrollbar.

If the element is absent or its width is unsupported (zero, fractional, over 4096px, or a different inline-style format), labels retain the previous `view-lines` query-container calculation and scrollbar adjustment. That fallback can still center against overflowing content. In particular, the pinned VS Code 1.100.3 screenshot runner lacks `native-edit-context`, so this is not a fix for every old-renderer CI failure. The bounded lookup adds stylesheet rules; its limit keeps that cost finite. Do not expand it without measuring layout cost.

Backgrounds start one column after the frame stroke, including blank rows and comments without star prefixes. This depends on internal Monaco markup and CSS nesting. Native interaction checks cover one editor, splits and removal of the input element to verify fallback; pinned light/dark, sidebar-open and minimap-enabled screenshots cover the legacy branch. Renderer `.layout.json` artifacts retain widths for investigation without modifying the DOM.

Language labels `js`, `javascript`, `ts` and `typescript` select simplified keyword, string, number and comment colors. Missing or unsupported labels use a plain-code foreground on the same contrasting background. Coloring uses the TypeScript lexical scanner rather than full semantic highlighting; embedded languages, regular expressions and template expressions can differ from normal editor highlighting. Indented Markdown code retains its previous raw presentation.

Theme and editor font-size/line-height changes refresh the decorations. Light and dark screenshots cover the pinned font and unwrapped layout. Additional fonts, wrapping and high-contrast visual checks remain future coverage.

## Manual check

After building, reload the Extension Development Host or close it and press F5. Open `tests/fixtures/fenced-code.ts` there. “Cursor” means the blinking insertion point; do not type a character.

1. Press Ctrl+G, enter `1:1`, and press Enter. The cursor should be before `export`. Lines 5–11 should have a contrasting code band. Line 5 should show a horizontal bar labeled `TypeScript`; line 11 should show an unlabeled bar. On lines 6–8, keywords, strings, numbers and comments should have distinct colors. The `**` inside the string stays visible. Line 9 remains a blank colored row.
2. Click line 6 before `const`. The whole comment should reveal its original source. Return to `1:1` to restore rendering.
3. Use **Preferences: Color Theme** to switch between light and dark themes. The code appearance should switch to the opposite light/dark palette.
4. Lines 15–17 should show the unsupported Python fence with a plain-code foreground. Lines 21–24 should show colored JavaScript inside a grouped `//` comment.
5. Run **Markdown in Code: Toggle Rendering** twice. The first invocation reveals source everywhere; the second restores rendering while the cursor stays at `1:1`.

The automated suite covers range mapping with LF/CRLF, empty rows, incomplete fences, fallback languages, palette contrast and disjoint foreground ranges. Real VS Code checks cover source preservation, interactions and theme refresh. Reviewed light/dark screenshots are linked in [the visual testing guide](visual-testing.md).

The user confirmed the fenced-code presentation and F5 behavior work correctly on 2026-10-17, including the minimap centering fix.
