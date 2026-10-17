# Markdown horizontal rules

Markdown thematic breaks (`---`, `___`, and spaced star forms such as `* * *`) render as thin theme-colored horizontal lines inside multiline block comments and grouped standalone line comments. Lines extend to the visible editor edge, keeping their original source rows.

The Markdown parser decides whether a line is a rule. A dash underline immediately below a paragraph remains a Setext heading. Escaped markers, indented/fenced code and HTML comments remain literal. Lone line comments, trailing line comments and same-line block comments keep rule syntax raw. List markers are unchanged.

Selecting or clicking the comment reveals its original source; leaving restores rendering. The global toggle applies as usual. The extension does not edit source text.

## Manual check

Reload the F5 development window and open `tests/fixtures/horizontal-rules.ts`.

1. Press Ctrl+G, enter `1:1`, then press Enter. Lines 7, 11, 13 and 20 should display horizontal lines, with their Markdown markers hidden. Line 23 should keep its `/* --- */` source visible.
2. Click line 7. The first block comment should reveal all its original markers. Return to `1:1` to restore the rules.
3. Run **Markdown in Code: Toggle Rendering** twice: source should appear, then the rules should return.

LF/CRLF mapping and literal contexts have unit coverage. Real VS Code checks cover reveal/restoration, toggling and source preservation. The user approved this slice after manual testing on 2026-10-17. The [horizontal-rule screenshot](../tests/visual/baselines/horizontal-rules-light.png) is now a reviewed baseline.
