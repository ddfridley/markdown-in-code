# Markdown in Code

An experimental VS Code extension for Markdown in JavaScript/TypeScript comments (including JSX/TSX), ready for private local testing. Standalone Markdown files are outside this release. HTML-comment presentation, images/richer blocks and additional source languages are deferred to a future release.

## Install locally for everyday testing

The private extension ID is `local.markdown-in-code`, version `0.0.2`. Build and install from Git Bash using the repository's NVS setup:

```sh
source ./.bashrc
npm ci
npm run package:local
code --install-extension ./markdown-in-code-0.0.2.vsix --force
```

Run **Developer: Reload Window** in your normal VS Code window after installation. F5 is unnecessary for everyday use. Node/NVS is needed for development and the demo; the installed extension bundles its runtime dependencies.

If the older **MD in Comments** extension is also enabled, disable it in the Extensions view while testing to avoid two renderers affecting the same comments. MIEV can remain available for standalone Markdown. Installation does not change other extensions or editor settings.

To update, increment the package version, rebuild, reinstall the new VSIX and reload. Keep a previous VSIX to roll back using the same install command with `--force`. To uninstall:

```sh
code --uninstall-extension local.markdown-in-code
```

The package includes the bundled extension, demo, documentation and third-party license notices; development files and source maps are excluded. This private package has not been published to the Marketplace. See [release scope and hardening](PLAN.md#current-release-scope-and-hardening).

## Feature tour

Heading sizes adapt to `editor.fontSize` and `editor.lineHeight`. H1 size equals effective line height times `markdownInCode.fontFitAllowance` (default `1.208421`); lower levels keep their proportions. You can calibrate this in User or Workspace settings, for example:

```json
"markdownInCode.fontFitAllowance": 1.208421
```

An allowance of `1` makes H1 font size equal the line height. Font metrics and underlines vary, so the calculation does not guarantee no overlap. Automatic line height (`0`) uses a platform estimate. See [heading layout](docs/headings.md).

Open [demo.ts](demo.ts) in the F5 development window for a working-feature tour, with layered Node HTTP functions documented using the [md-comments function template](../md-comments/README.md#function-documentation-template). Put the cursor outside comments to render them. To run the server with the repository's Node 24 version, use Git Bash:

```sh
source ./.bashrc
node demo.ts
```

Open the printed URL (normally `http://127.0.0.2:3000/`); Ctrl+C stops the server. Optional `HOST`, `PORT` and `GREETING` environment variables configure it. `PORT=0 node demo.ts` requests an available port. The demo needs no extra dependencies and is included in the normal TypeScript check.

The prototype renders inline formatting, headings, horizontal rules, lists, task boxes, blockquotes and links in code comments. Clicking or selecting a comment reveals its source. Run **Markdown in Code: Toggle Rendering** to toggle formatting globally. These interactions have unit, extension-host and screenshot coverage.

Press **Escape** with one caret inside a revealed comment to render it without moving the cursor or scrolling to its end. Editor popups and selections keep their usual Escape actions first. Clicking, moving or typing resumes source editing. See [Escape behavior and manual checks](docs/escape.md).

Escape only restores rendering; it does not toggle back to editing. A repeat click at the identical caret position may leave the comment rendered. Click a different column on the same line or press an arrow key to edit again.

The table slice adds aligned GFM columns, bold headers and header rules while retaining inline formatting and click-to-edit. See [table behavior, limits and F5 checks](docs/tables.md). Table screenshots and the preceding link slice have human approval.

Block comments now display an open-right `┌─ / │ / └─` frame, with one column between the vertical stroke and Markdown content. Source comment delimiters/prefixes reappear during editing. See [frame behavior and manual checks](docs/comment-boxes.md), including mixed prefixes and compact inline blocks. Real extension-host checks cover these transitions; screenshot comparisons pass in the pinned Linux environment; the fenced-code screenshots and F5 behavior have been reviewed and approved.

Horizontal borders reach the editor viewport's right edge. Two or more consecutive `//` comments with only whitespace to their left also form a framed Markdown block; trailing comments and isolated `//` lines remain inline.

Fenced code uses an opposite light/dark background and simplified JavaScript/TypeScript syntax colors. Other fence languages use plain text. See [fenced-code behavior and manual checks](docs/fenced-code.md).

For a Phase 1 manual check, open `tests/fixtures/comments.ts` in the development host:

- With the caret outside comments, bold and italic text should be styled and their Markdown markers hidden. The block-comment heading should be bold and theme-colored, with its opening `#` hidden. Heading sizes and weights decrease by level using the md-comments proportions; CSS percentages scale with the editor font, and word wrap preserves the same sizes (with documented overflow limits). See [heading behavior](docs/headings.md) for the CSS approach and layout limits.
- Click inside a comment: its complete Markdown source should reappear for editing. Move the caret back into code: formatting should return.
- Toggle rendering: comments should switch between source and formatting. Surrounding code and strings must remain visually unaffected, and rendering must never change the file contents.

The leading comment `*` prefixes are stripped from parser input, so ` * # Comment heading` is recognized as a heading. The frame now replaces those prefixes in rendered block comments. Full Markdown rendering remains later work; the screenshot harness covers selected layouts.

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

F5 now starts the development host with `--inspect-extensions=9333` and then attaches a Node debugger to `127.0.0.2:9333`. The launch task polls the inspector endpoint before attaching. This avoids the early startup pause used by the standard extension-host debug launch, which crashed with exit code 134 locally after the VS Code update. Removing the default Node-internals skip rule did not resolve that crash. The new host launch and inspector availability have been verified; F5 attachment still needs confirmation. The launcher records the inspector's target ID in the ignored `.vscode/debug-host.json` and reuses a matching running host on subsequent launches. Reload that development window to load rebuilt extension code, or close it before F5 for a fresh host. An unrecognized inspector on port 9333 still produces a port-in-use error. The launcher script currently requires Windows PowerShell.

## Adapter boundary

`src/comments.ts` uses the TypeScript compiler's syntax tree and comment trivia APIs rather than a regular expression over source text. Each comment is parsed separately. Adjacent standalone line comments join into Markdown blocks. Block comments remove delimiters and conventional leading `*` prefixes; indentation after those prefixes remains meaningful Markdown indentation. Unterminated block comments extend to EOF as recognized by the compiler.

`src/markdown.ts` parses normalized comment text with unified, remark-parse and remark-gfm, then emits UTF-16 offset ranges. The mapping splits multiline ranges into content-only spans, excluding comment delimiters, stripped prefixes and line endings. The extension applies decorations only; it never edits document text. Parsing is cached by document URI and version, so cursor changes only filter existing ranges.

Selective adaptation is the chosen reuse strategy: keep extraction, mapping, parser output and editor interaction separate. This prototype independently implements the narrow AST-to-range boundary; it does not copy MIEV's parser or depend on the installed extension. Advanced Markdown features and full block rendering remain future work.

## Credit

[Markdown Inline Editor](https://github.com/SeardnaSchmid/markdown-inline-editor-vscode) by SeardnaSchmid is the architectural reference for the remark AST-to-decoration approach. Its implementation is MIT licensed. No upstream source code is vendored in this phase; any future copied code must retain its applicable copyright and MIT license notices. The earlier `md-comments` project informs the intended behavior.

Unit tests cover comment extraction and computed ranges. `npm run test:integration` runs real VS Code extension-host behavior checks. The separate pinned Linux screenshot harness checks painted editor output. See [testing instructions](docs/testing.md) for the test applications, isolated sessions and CI configuration.

The screenshot harness is now available: `npm run test:visual:docker` compares thirty-one editor captures in a pinned Linux container. See the [visual testing guide and baseline review gallery](docs/visual-testing.md). Tests write separate preliminary images and leave accepted images read-only. Changed/missing images fail until interactive human acceptance; automatic updates are disabled.

Phase 2's [behavior contract](docs/behavior.md) specifies comment types, selection boundaries, multiple carets, split editors, toggling, cache updates, and the raw presentation of deferred Markdown features. Use `tests/fixtures/behavior.ts` for its manual checks.

See [horizontal-rule behavior and manual checks](docs/horizontal-rules.md) for the reviewed slice. The [feature-slice plan](PLAN.md#5-expand-in-small-feature-slices) tracks the heading implementation and the remaining feature slices.

Heading levels, Setext marker hiding and relative typography are implemented and approved. See [heading behavior and exact manual checks](docs/headings.md).

Unordered-list bullets and their screenshots are approved; see [behavior and exact checks](docs/unordered-lists.md).

Ordered and task lists and their screenshots are approved; see [numbering, checkbox behavior and manual checks](docs/ordered-tasks.md).

Blockquotes and their screenshots are approved; see [nested bars, contained Markdown and manual checks](docs/blockquotes.md).

Links, autolinks and references are implemented and approved, including **Markdown in Code: Open Link at Cursor**; see [behavior and manual checks](docs/links.md). Their screenshots have human approval.

Same-line comment links render too. Normal click edits; Ctrl+click (or the modifier shown in VS Code's hover) opens the link while preserving the source cursor and rendered comment.
