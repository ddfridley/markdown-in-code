# Markdown in Code

Phase 1 prototype of a VS Code extension for Markdown in JavaScript/TypeScript comments (including JSX/TSX). Standalone Markdown files are outside the initial scope.

The prototype styles bold, italic, strikethrough, inline code, and block-comment headings. Clicking or selecting a comment reveals its source. Run **Markdown in Code: Toggle Rendering** to toggle formatting globally. These interactions are provisional; extension-host and visual validation are later phases.

For a Phase 1 manual check, open `tests/fixtures/comments.ts` in the development host:

- With the caret outside comments, bold and italic text should be styled and their Markdown markers hidden. The block-comment heading should be bold and theme-colored, with its opening `#` hidden. Heading text stays at the editor's font size; the supported text-decoration API has no font-size property.
- Click inside a comment: its complete Markdown source should reappear for editing. Move the caret back into code: formatting should return.
- Toggle rendering: comments should switch between source and formatting. Surrounding code and strings must remain visually unaffected, and rendering must never change the file contents.

The leading comment `*` prefixes are stripped from parser input, so ` * # Comment heading` is recognized as a heading. The comment prefixes themselves remain visible. Phase 1 proves extraction and mapping; it does not yet promise full Markdown rendering or verified visual layout.

With Node.js 22 or newer installed:

```sh
npm install
npm run validate
```

For this Windows development setup, select Node through NVS in Git Bash first:

```sh
source ~/AppData/Local/nvs/nvs.sh
nvs use 24.22.0
```

Open this directory in VS Code and press F5 to launch the extension development host. Open `tests/fixtures/comments.ts` there and place the caret outside comments to see formatting.

If F5 reports that the extension host did not start in 10 seconds, use **Terminal > Run Task > Preview Markdown in Code**. This builds the extension and opens the fixture in a development window without debugger attachment. The local debugger trace has shown connection failures to its loopback debug port; this preview task bypasses that startup path. Breakpoints require a working debug launch and are unavailable through this task.

F5 now starts the development host with `--inspect-extensions=9333` and then attaches a Node debugger to `127.0.0.1:9333`. The launch task polls the inspector endpoint before attaching. This avoids the early startup pause used by the standard extension-host debug launch, which crashed with exit code 134 locally after the VS Code update. Removing the default Node-internals skip rule did not resolve that crash. The new host launch and inspector availability have been verified; F5 attachment still needs confirmation. The launcher records the inspector's target ID in the ignored `.vscode/debug-host.json` and reuses a matching running host on subsequent launches. Reload that development window to load rebuilt extension code, or close it before F5 for a fresh host. An unrecognized inspector on port 9333 still produces a port-in-use error. The launcher script currently requires Windows PowerShell.

## Adapter boundary

`src/comments.ts` uses the TypeScript compiler's syntax tree and comment trivia APIs rather than a regular expression over source text. Each comment is parsed separately. Line comments do not join into Markdown blocks. Block comments remove delimiters and conventional leading `*` prefixes; indentation after those prefixes remains meaningful Markdown indentation. Unterminated block comments extend to EOF as recognized by the compiler.

`src/markdown.ts` parses normalized comment text with unified, remark-parse and remark-gfm, then emits UTF-16 offset ranges. The mapping splits multiline ranges into content-only spans, excluding comment delimiters, stripped prefixes and line endings. The extension applies decorations only; it never edits document text. Parsing is cached by document URI and version, so cursor changes only filter existing ranges.

Selective adaptation is the chosen reuse strategy: keep extraction, mapping, parser output and editor interaction separate. This prototype independently implements the narrow AST-to-range boundary; it does not copy MIEV's parser or depend on the installed extension. Advanced Markdown features and full block rendering remain future work.

## Credit

[Markdown Inline Editor](https://github.com/SeardnaSchmid/markdown-inline-editor-vscode) by SeardnaSchmid is the architectural reference for the remark AST-to-decoration approach. Its implementation is MIT licensed. No upstream source code is vendored in this phase; any future copied code must retain its applicable copyright and MIT license notices. The earlier `md-comments` project informs the intended behavior.

Unit tests cover comment extraction and computed ranges. `npm run test:integration` runs real VS Code extension-host behavior checks. Neither layer establishes VS Code paint quality; pinned Linux screenshot comparisons remain a later milestone. No screenshot baselines are generated here. See [testing instructions](docs/testing.md) for the pinned test application, isolated test sessions and CI configuration.

Phase 2's [behavior contract](docs/behavior.md) specifies comment types, selection boundaries, multiple carets, split editors, toggling, cache updates, and the raw presentation of deferred Markdown features. Use `tests/fixtures/behavior.ts` for its manual checks.
