# Comment rendering behavior

This is the Phase 2 contract for the initial extension. Pure parser and rendering-session tests enforce the rules, Phase 3 checks real VS Code event wiring and decoration updates, and Phase 4 now compares six pinned Linux editor captures. See `docs/visual-testing.md` for coverage, limitations and the baseline review gallery.

## Scope and syntax

| Input | Current behavior |
| --- | --- |
| JavaScript, TypeScript, JSX, TSX | Render compiler-recognized comments only. Strings, regex literals, template text and JSX text remain code. Comments inside template expressions can render. |
| Block comments | Parse each comment as its own Markdown document. In rendered mode hide delimiters and structural prefixes behind an open-right box frame with a one-space inset. Normalize JSDoc/conventional star prefixes, interior `//` prefixes and common block indentation without stripping fenced/indented code content. See `docs/comment-boxes.md` for ambiguous star-list handling, compact blocks and layout limits. Reveal original source when editing. |
| Consecutive standalone `//` comments | Two or more adjacent rows with only whitespace to the left form one framed Markdown block, including headings and multiline formatting. Blank source lines, code and trailing comments break the group. An empty `//` row remains part of the group. |
| Lone standalone and trailing `//` comments | Parse independently, with bold, italic, strike and inline-code decorations. No heading styling or frame. |
| Same-line `/* … */` comments | Keep delimiters visible and apply inline formatting such as bold/italic. No frame or heading styling, whether standalone or following code. |
| Bold, italic, strikethrough | Hide recognized delimiters and style content; support nesting and GFM single/double tildes. Escaped markers stay literal. |
| Inline code | Hide matching backtick runs and apply a background; apparent Markdown inside stays literal. Preserve source spacing rather than reproducing HTML whitespace normalization. |
| Block-comment ATX headings | Hide opening hashes and optional closing hashes, and style the title bold with a theme color. Keep the editor's font size. |
| Setext headings | Recognize and color the range; underline markers remain raw. Complete heading presentation is deferred. |
| Lists and horizontal rules | Keep structural markers raw. Recognized inline formatting inside list items can render. Bullet replacement, numbering and rule drawing are later feature slices. |
| HTML comments inside Markdown | Preserve their syntax and content without interpreting contained Markdown. An HTML block also suppresses Markdown according to remark's block rules. |
| Fenced and indented code | Leave syntax and content raw, with no nested Markdown styling. Fence hiding, syntax highlighting and block backgrounds are deferred. |
| Unterminated source comments | Follow the TypeScript compiler's recovered region, including EOF. Never invent nested block-comment boundaries. |
| Standalone `.md`, Escape | No rendering registration for `.md`; no Escape binding or Escape-driven mode change. |

## Editing and selections

The default state is rendered. Clicking or moving a caret anywhere in a recognized comment, including its delimiters, reveals that entire comment. A caret exactly at the comment's end also reveals it, supporting typing at the end of line comments. Moving all carets outside restores rendering.

A nonempty selection reveals every comment it overlaps. Selections use half-open ranges: merely ending at a comment's start, or starting at its end, does not reveal that comment. Forward and reversed selections have the same effect. Multiline selections and multiple carets can reveal several comments together. Other comments remain rendered.

Split editors share parsed results but compute visibility from their own selections. Inactive visible editors retain their selection-based state. The extension does not move carets, clear selections, change their native highlight, or write source text.

## Toggle and updates

**Markdown in Code: Toggle Rendering** applies globally within the extension-host session, across supported documents and split editors. Disabled means all source is raw. Enabling rendering still respects each editor's current selections. The setting is not persisted across host restarts.

Text edits invalidate parsing by document version. Selection changes reuse parsed ranges. Edits while disabled are parsed when rendering is re-enabled. Closing a document releases its cache; reopening cannot reuse stale ranges. Unsupported language modes clear this extension's decorations and cached results.

All Markdown positions and source offsets use UTF-16. LF and CRLF map to equivalent content. Every mapped Markdown decoration lies within a comment content segment; multiline ranges split at prefixes and newlines. Frame decorations separately hide structural syntax and attach border glyphs inside the comment's source region. Source code outside comments never receives these decorations.

## Regression coverage and remaining checks

`tests/adapter.test.ts` covers syntax contexts, malformed comments, heading offsets, indentation and line endings. `tests/markdown-behavior.test.ts` covers HTML comments, list/rule preservation, code blocks, escaping, JSDoc and unprefixed blocks, and exhaustive subranges of a small multiline fixture. `tests/rendering.test.ts` covers selection boundaries, multiple carets, multiline selection, restoration, global toggling, split-editor independence, and cache invalidation.

For these manual checks, open `tests/fixtures/behavior.ts` in the **Extension Development Host** window. “Caret” means the blinking text cursor, not a typed `^` character. Line numbers below refer to this fixture. Use **Ctrl+G**, enter a line number, and press Enter to move there.

1. **Rendered formatting:** click line 1 immediately before `const` (column 1). Line 4 should show a bold, colored heading without its `#`; line 5 should show italic `word`, crossed-out `strike`, and an inline-code background. Line 7's dash, line 9's rule, line 11's HTML comment, and lines 13–15's code fence/content stay raw. The string on line 1 must keep its literal `**` characters.
2. **Reveal a comment:** click line 4 immediately before `Heading`. The whole comment on lines 3–16 should show its original Markdown markers. Click line 1 before `const` again; formatting should return.
3. **Select across comments:** click line 1 before `const`, then hold Shift and click line 25 before `const`. Both block comments and the standalone comment on line 24 should reveal their Markdown markers. The trailing comment on line 25 is outside this selection. Click line 1 without Shift to clear the selection and restore formatting.
4. **Toggle and edit:** with the cursor on line 1, press Ctrl+Shift+P and run **Markdown in Code: Toggle Rendering**. All Markdown markers should become visible. On line 24 change `bold` to `updated`, keeping the surrounding `**`. Run the toggle command again, then click line 1 before `const`. Line 24 should render `updated` in bold. Undo the text edit afterward if desired.
5. **Split editors:** with this file active, press Ctrl+\\ to open it in two side-by-side editors. In the left editor click line 4 before `Heading`. In the right editor click line 1 before `const`. The left editor should show the first block comment's Markdown markers; the right should render that same comment. Each editor retains its own cursor position even when the other editor has focus.
6. **Plain Text:** return to one editor and click line 1 before `const`. Press Ctrl+K, release, then press M. Choose **Plain Text**. All Markdown markers should be visible and extension formatting should disappear in both splits if still open. Repeat and choose **TypeScript** to restore the file's language mode and rendering.

These interaction boundary cases now have unit and real extension-host coverage; see `tests/integration/index.ts` and `docs/testing.md`. Marker alignment, selection paint, clipping and colors still require visual checks. No pixel baselines are approved by these tests.

The user has confirmed that all six manual checks above pass. Phase 3's automated checks also pass locally on Windows with VS Code 1.100.3.

Planned fenced-code presentation: render code within a block comment using a contrasting light/dark appearance opposite to the surrounding comment, with syntax-colored text (a simplified palette is acceptable). This feature is deferred and tracked in PLAN.md; the current raw-fence behavior remains the tested contract until implementation.
