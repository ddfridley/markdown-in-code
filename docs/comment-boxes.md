# Block-comment frames

Delimiter-only opening rows may use extra stars, such as `/***`. These stars are hidden with the opening delimiter and the row becomes the top corner and horizontal rule. Asterisks in body text and same-line emphasis remain Markdown content. Regression tests cover LF/CRLF and bold text immediately below the opener; the manual example is `md-comments/test.ts` line 239.

Rendered block comments now hide their source delimiters and structural prefixes and display an open-right frame:

```text
┌─────────────────
│ Comment heading
│ Text
└─────────────────
```

The characters are Unicode equivalents of the requested CP437 codes 218, 196, 179 and 192. A content row reserves two monospace columns for `│ `: the vertical stroke plus one space. Markdown indentation follows that inset, so nested content and indented code intentionally start farther right. The frame follows the visual column of the block's opening delimiter, including tab stops.

The right edge remains open. Horizontal rules extend to the right edge of each editor viewport and adapt automatically when its width changes. A thin rule attachment is clipped by the editor; a compensating negative margin cancels the attachment's layout width. Source line lengths remain unchanged. The implementation uses standard decoration attachments, borders, margins and source opacity; it does not rewrite text or inject unsupported CSS properties.

## Comment forms

- Delimiter-only opening and closing lines become the top and bottom borders. Interior blank lines display the vertical stroke too.
- Within a multiline block, a line containing comment content gets `│ `, even when it also contains an opening or closing delimiter. No synthetic lines are inserted. When `/*` and `*/` occur on the same source line, the comment is inline: both delimiters remain visible, no frame is added, and only inline Markdown formatting is applied.
- An unterminated block has no invented bottom border. Source recovery follows the TypeScript compiler.
- JSDoc blocks support conventional ` * ` and `* ` interior prefixes. Plain blocks with indented structural stars support mixed variants too. Outside fenced or indented code, `//` can be an interior structural prefix. Prefix-free lines are also supported, with the opening line's common whitespace indentation removed from parser input.
- In a plain block with no structural-star convention, `* item` stays a Markdown list item. To disambiguate decorative stars, use a JSDoc opener or the conventional indented star format. Asterisks in `**bold**` and `*italic*` stay Markdown, and indentation after a prefix stays meaningful.
- Two or more consecutive standalone `//` comments form a Markdown block and get one shared frame. Only whitespace may precede each `//`. A blank source line, intervening code or a trailing comment breaks the group; an empty `//` row stays inside it. Headers and formatting can span the group, and editing any row reveals the entire group. When the first/last rows contain text, they use `┌ ` and `└ ` with horizontal rules continuing after their text, so source lines are not inserted. Empty boundary `//` rows become ordinary top/bottom border rows.
- A lone standalone `//` and comments following code retain inline-format behavior without frames. `//` inside fenced or indented code in a `/* */` comment is retained as code content.

Moving a cursor into the comment, selecting through it, or toggling rendering off removes the whole frame and reveals the original source. Leaving the comment or enabling rendering restores the frame. Split editors compute visibility independently. Tab-size changes recalculate the frame without reparsing the document.

## Manual check

Open `tests/fixtures/boxes.ts` in the development host after rebuilding. If F5 reuses a running host, reload that development window to load the rebuilt extension.

1. Click line 1 immediately before `const`. Lines 3–9 should show the heading/text frame, and lines 11–16 should show one aligned frame despite their mixed source prefixes.
2. Check the tab-indented frame on lines 19–23. Its border should align with the block's indentation, and `indented code` should retain its additional Markdown indentation after the one-space inset.
3. Click line 4 before `Comment`. Lines 3–9 should reveal their source, including `/**`, ` * ` and `*/`. Click before `const` on line 1 to restore the frame.
4. Run **Markdown in Code: Toggle Rendering**. All comment source formatting should reappear. Run it again while the cursor is on line 1 to restore the frames.
5. Find `const inline = 1; /* **Inline comment** */` near the end of the fixture. It should have no frame, retain its `/*` and `*/`, and show `Inline comment` in bold. Surrounding code text must remain intact. Lone and trailing `//` comments stay inline too.

Automated range/state checks pass. A captured Windows VS Code workbench was inspected for border alignment, mixed prefixes, tabs and the inset. This is visual evidence for this fixture, not an approved screenshot baseline. Frames are per physical source line: soft-wrapped continuation rows, wide/combining glyphs and alternative fonts still need dedicated visual coverage in the screenshot phase.

For the additional standalone-comment and viewport-width checks, open `tests/fixtures/line-blocks.ts` and click line 1 before `const`. Lines 8–10 should form a single framed Markdown block, and lines 14–16 demonstrate empty `//` boundary rows. Line 12's trailing comment should remain inline. Click line 9 before `Bold` to reveal the entire group, then click line 1 again to restore it. Resize the editor: its horizontal rules should continue to the visible right edge. Captures of this fixture were inspected at the normal and narrower viewport sizes.

## Capture feasibility

`scripts/capture-preview.mjs` captures only a VS Code workbench served by an explicitly launched local Chromium debugging endpoint. With an isolated preview launched using `--remote-debugging-port=9444`, Node.js 24 can run:

```sh
node scripts/capture-preview.mjs 9444 .vscode-test/box-preview.png
```

Optional `--width=900` captures a resized 900-by-800 viewport; `--metrics` reports layout measurements, and `--close` also closes that isolated test application. Use a separate user-data directory for previews; do not aim it at your normal editor. This inspection utility neither compares images nor creates expected baselines. The separate [pinned Linux visual harness](visual-testing.md) now provides comparison, explicit updates, failure artifacts and the baseline review gallery.
