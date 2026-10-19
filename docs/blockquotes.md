# Blockquotes in comments

Parser-recognized `>` quote markers render as theme-colored `│` bars in framed block comments and grouped standalone line comments. Each explicit marker keeps one source column, and source spaces retain the inset. Nested `> >` quotes show two bars. A marker without a following space is valid Markdown; add a source space when a visible gap is wanted.

Bold, italic, headings, Setext titles, lists, task boxes and rules retain their existing behavior inside quotes. Quoted fenced code uses the contrasting code palette and language bars. The adapter removes quote prefixes from its parsing view before tokenizing code, while mapping token ranges back to the original source and preserving literal greater-than signs in the code itself.

This is source-based presentation. A lazy continuation row without `>` remains part of the quote's Markdown paragraph but receives no invented bar or added indentation. Blank source rows, wrapping and code-band layout retain the existing editor-row limitations; continuous HTML-style quote borders and reflow are outside this slice. The replacement bars occupy explicit source-marker columns.

Escaped greater-than signs, HTML, fenced/indented code and unframed lone/trailing/same-line comments remain literal. The feature does not alter source. Clicking or selecting anywhere in a comment reveals its complete original Markdown; leaving restores the bars. Toggle/edit/restore uses the existing interaction.

## Manual check

Reload F5 and open `tests/fixtures/blockquotes.ts`.

1. Press Ctrl+G, type `1:1`, and press Enter. Lines 4–5 should show a quote bar after the comment frame. Lines 7–8 should show two quote bars. Bold and italic text should retain their formatting.
2. Line 10 should show a level-two heading after the bar. Lines 12–13 should show a bullet and completed task. Line 15 should show a horizontal rule after the quote marker.
3. Lines 17–19 should show two quote bars beside a contrasting TypeScript code band with opening/closing language rules and colored `const`/`42`. The source quote markers must not appear as `>` inside code text.
4. Line 21 should show a quote bar. Line 22 is a lazy continuation with no source `>`; it deliberately has no extra bar. Lines 25–26 should show grouped and nested quote bars. Line 28 should retain the inline comment's literal `>`.
5. Click before `Nested` on line 7. The whole comment should reveal source. Return to `1:1` to restore rendering. Toggle off, edit the quoted text, toggle on and leave the comment; confirm the edit appears without changing its quote structure.

Unit checks cover LF/CRLF mapping, nested/blank/lazy rows, list-contained and grouped quotes, literal contexts, headings/Setext, list/task/rule/code composition, token mapping and source reveal. A real VS Code check verifies decoration updates, source preservation, selection and edits while disabled. New light/dark captures require separate human approval.

The user approved run `1792441995622`; all twenty-one images are recorded in the acceptance manifest, including both blockquote themes.
