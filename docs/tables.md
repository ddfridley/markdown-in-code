# GFM tables

Tables in framed JavaScript/TypeScript comments render with aligned columns, bold headers, vertical separators and a horizontal header rule. Leading/trailing source pipes are optional. Markdown delimiter-row colons select left, center or right alignment. Columns expand to the widest rendered cell, with a minimum of three text columns and one space on either side.

Bold, italic, inline code and links retain their existing formatting and activation. Escaped pipes stay inside their cells rather than becoming separators; their source backslash stays visible, consistent with the existing source-based escape presentation. Blockquote bars remain outside the table. Consecutive standalone `//` comments also support tables.

Clicking or selecting the comment reveals the original table source. Leaving it restores the aligned layout. Editing recomputes column widths; toggling and independent split-editor selection keep the existing behavior. Rendering never rewrites table source or adds document lines. The delimiter row is reused for the header rule; no additional top/bottom border rows are inserted.

This first layout uses fixed editor columns. Latin letters and common typographic punctuation (including en/em dashes and curly quotes) are supported. Tables with tabs, wide/combining glyphs, emoji, irregular body-row cell counts or a total rendered width over 4096 columns retain their source layout and existing inline formatting. Fenced/indented code remains literal. Very narrow viewports can clip or wrap according to source columns rather than the padded presentation, as with the existing heading/source-width limitations. General HTML tables and multiline cells are outside this slice. The opened hint and native link underline retain their existing behavior; an underline can extend across cell padding.

## F5 review

For the width-limit fallback, open `tests/fixtures/tables-overflow.ts` at `1:1`. Line 6 contains a cell over 5,500 characters, beyond the 4,096-column table limit. Its pipes and delimiter row should remain readable source; no oversized table attachment is created. The separate table on lines 10–12 should still render normally. Click/edit the long cell, leave the comment, and toggle rendering: no text should be lost. Shortening its content below the limit should restore table rendering automatically. Automated tests exercise exact 4,096/4,097-column boundaries, reveal, editing, toggle, independent following-table behavior and recovery in the same document.

The fixture includes the user's added `Name` column with `Long` beside the oversized `Description`. Tests read this updated file directly. They require the whole oversized table to fall back, then verify that both columns render after shortening the description and that the `Long` cell is preserved.

The user's copied plan table is preserved in `tests/fixtures/tables.ts`. A separate copy in `tests/fixtures/tables-long.ts` and the visual fixtures locks down that exact example for automated tests. It previously hit both the ASCII-only guard (because of `1–6`) and the 240-column guard. Both restrictions have been relaxed without changing the source. Open the standalone long-table fixture at `1:1` to see its header and aligned columns. Wide plain-text tables (over 120 columns) paint each row as one unwrapped, measured-width attachment. Its width contributes to horizontal scrolling even with word wrap on; drag the bottom scrollbar to read long descriptions. With word wrap on, the source-based continuation space remains blank; the next actual source row is preserved. With wrapping off, rows are compact as before. Wide tables containing rich inline formatting retain the cell layout instead of losing that formatting. Cell text is not reflowed into a compact viewport-width table.

Run **Developer: Reload Window** in the development window and open `tests/fixtures/tables.ts`. Press Ctrl+G, enter `1:1`, and press Enter.

1. Lines 4–8: compare the vertical separators. `Name` is left aligned, `Status` centered and `Count` right aligned. The header is bold and line 5 is a horizontal separator. Bold/italic/code/link styling remains visible in the cells.
2. Lines 11–14: the table without outer source pipes should also have aligned borders. Lines 16–18 retain the quote bar outside the table; lines 21–24 show the grouped line-comment table.
3. Click `Longer name` on line 7: the entire comment should reveal its source. Change it to a longer value, then return to `1:1`: column widths should update. Undo your edit to restore the fixture.
4. Toggle rendering off and on with the cursor at `1:1`. Check raw/rendered transitions and that surrounding code is unaffected.
5. Ctrl+click `Guide` on line 8. It should open the destination, keep the table rendered and show the existing two-second opened hint. Normal clicking should reveal source.

Review [run 1792524599284](../tests/visual/preliminary/1792524599284/index.html). The six new table images, including wrapping off/on and an actual rightward-scroll view of the long table, appear first; all 23 accepted cases match. The user approved these exact screenshots on October 20, 2026; all 29 cases are now accepted. The manual fixture is separate from the visual fixture, so review edits will be preserved.
