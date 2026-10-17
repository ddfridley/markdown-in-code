# Markdown in Code: Development Plan

## Recommendation

Build `markdown-in-code` as a distinct extension, using MIEV as the implementation base or selectively adapting its Markdown parsing and decoration code. Do not wait for upstream participation: the author is not reachable and the repository appears inactive, with many open PRs. Do not treat the installed MIEV extension as a runtime dependency: its package is private, it exposes no supported library API, and its parser/decorator are internal extension modules. First prove the comment-to-document mapping, then choose between a fork-based workflow and selective code adaptation.

Give MIEV and its author clear credit in the new extension's documentation and preserve all applicable MIT license and copyright notices for reused code. Keep the projects separate so users can install MIEV for standalone `.md` rendering; `.md` support in `markdown-in-code` is a later nice-to-have, not a first-release goal.

The key boundary to validate is: extract Markdown text from comment regions, parse it, then map every decoration range back to the original source document without affecting code or text outside those regions. MIEV's `MarkdownParser.extractDecorationsWithScopes(text)` already accepts text and returns position-based ranges, which is a useful starting point. Its current language selectors, however, target Markdown-like files rather than programming-language comments.

## Project Goals

Use `md-comments` as the statement of intended behavior, not as the implementation to preserve. Its README describes:

- Full Markdown in block comments and `.md` files; a smaller inline-format set in single-line and trailing comments.
- Cursor-driven raw editing and a command/keyboard toggle.
- Support for common source languages.
- The 0.0.8 backlog: visual regression testing, editing/ESC behavior in Markdown files, selection highlighting, unordered-list marker rendering, HTML-comment marker handling, horizontal rules, and a few example/docs cleanups.

MIEV brings a more mature Markdown parser and broader Markdown features, including GFM, tables, math, Mermaid, emoji, mentions/references, and careful CRLF handling. Reuse these where they make sense, but keep comment parsing, source mapping, and editing interaction as separate responsibilities.

## Decisions To Make

1. **Reuse boundary:** Start by adapting parser inputs/outputs, not MIEV's full activation, commands, or Markdown-only language registration. Keep the first implementation small enough to make future upstream synchronization practical.
2. **Screenshot environment:** Use cross-platform unit/integration tests for normal development, and a pinned Linux CI runner for screenshot baselines. A single pixel baseline is not expected to compare identically on every OS because fonts, Electron, and rendering differ.

## Phased Plan

### Current implementation status

Phase 3 is complete locally: 10 integration checks passed in a real, isolated VS Code 1.100.3 extension host on Windows. Added a test-mode-only decoration-completion signal, a pinned `@vscode/test-electron` runner, and checks for activation, commands, selections/carets, edits, editor switching, split views, language transitions, standalone Markdown exclusion, tab reopening and document disposal. The suite exposed and fixed missing decoration updates on document-open/language-change events. TypeScript checking, 25 unit tests and the extension build also pass. A Windows/macOS/Linux CI workflow is configured; remote CI execution and non-Windows results are not yet verified. See `docs/testing.md`. Next: the recorded block-comment box feature slice, then screenshot feasibility and regression testing. Contrasting fenced-code rendering remains deferred.

The user confirms all six Phase 2 manual checks in `docs/behavior.md` pass: rendered formatting, click-to-edit/restoration, selection across comments, toggle/edit/restore, independent split-editor visibility, and Plain Text/TypeScript language switching.

Phase 2 is complete at the specification and unit-regression layer. `docs/behavior.md` defines the interaction contract and explicitly records raw/deferred handling for lists, rules, HTML comments, code blocks, Setext headings, `.md` and Escape. The extension now uses the tested `RenderingSession` policy for selections, toggling and version caching, and clears decorations when a language is unsupported. Fixed unprefixed block-line emphasis extraction, the JSDoc opening star in parser input, single-tilde strike marker widths, and nonempty selections merely touching a comment boundary. Validation through `nvs.sh` passed TypeScript checking, all 25 tests across 3 files, and the bundle build. The new manual fixture is `tests/fixtures/behavior.ts`; its expanded interaction checks await manual confirmation or Phase 3 extension-host automation. Next: Phase 3, test real VS Code event wiring and decoration updates.

Phase 1 is complete. Automated adapter validation passed (TypeScript checking, 9 unit tests, and the extension build). User testing confirms that F5 starts the development host and extension, bold and italic render, heading hash markers hide, clicking a comment reveals its source, leaving the comment restores formatting, and the toggle command works. The start-then-attach debug configuration is confirmed working. These manual checks do not replace the extension-host automation and screenshot coverage planned below. Next: Phase 2, lock down behavior before expanding features.

Phase 1 prototype source, manifest, build scripts, development-host launch configuration, fixture, and focused adapter tests have been added. The reuse decision is selective adaptation of the architecture, with an independently implemented small remark-based parser adapter rather than vendoring MIEV's full parser. See README.md for the boundary and attribution.

Phase 1 adapter validation passed using Git Bash, sourcing `~/AppData/Local/nvs/nvs.sh` and selecting Node.js 24.22.0 with `nvs use 24.22.0`. Dependencies are installed and package-lock.json records their resolution. `npm run validate` passed TypeScript checking, all 7 adapter tests (including LF/CRLF, literal/JSX exclusions, malformed comments, multiline mapping and UTF-16), and the bundled extension build. The adapter exit criterion is covered by these tests. VS Code extension-host behavior and visual rendering have not yet been verified; manually inspect the fixture using the F5 launch configuration before relying on the provisional interactions.

### 1. Prove the adapter boundary

Manual feedback confirms bold and italic rendering in the development host. Heading recognition also worked (theme-colored text), but hash-marker hiding was missing and has now been added with LF/CRLF range regression coverage. Headings intentionally keep the editor font size in this prototype; larger heading typography requires a separate rendering investigation. README.md defines the current manual checks. Other interaction and visual checks remain unverified.

Subsequent manual feedback confirms heading hash markers hide after reloading the development window. Initial F5 launches have intermittently stalled before the extension host ready message (`debugBrk: true`); the cause remains unresolved. The temporary `--disable-extensions` diagnostic flag was removed because it added a distracting disabled-extensions banner and did not resolve the timeout. Debugger tracing remains enabled for further diagnosis.

Further debugger traces show failure attaching to the loopback inspector endpoint (`ECONNREFUSED ::1`, plus internal debugger cancellation errors). Added a **Preview Markdown in Code** task that builds and launches VS Code directly without debugger attachment. A direct launch was checked locally: the development host started and produced extension activation logs. F5 debugger attachment remains unresolved; use the preview task for manual rendering checks meanwhile.

After updating VS Code, the debugger connected but the host crashed with exit code 134 during early startup. Disabling Node-internals skip rules removed a premature `require('module')` evaluation but did not resolve the crash. F5 now uses a Windows PowerShell task to start the host with `--inspect-extensions=9333` (without breaking at startup), polls its inspector endpoint, and attaches a Node debugger over IPv4. The new launch script and inspector endpoint were verified; the user's F5 attachment needs confirmation. Close the development window between runs to release the port.

The launcher now records the project, port and inspector target ID in an ignored local state file and reuses a matching running host instead of failing the pre-launch task. The existing host from the verified preview was registered and reuse returned exit code 0. A reused window needs reloading to load rebuilt extension code; closing it before F5 requests a fresh host. Unrecognized listeners are not reused.

- Establish the new extension's identity, manifest, build, and test harness in this repository.
- Select a tiny fixture containing code before and after a block comment, plus one trailing and one standalone line comment.
- Implement a prototype comment-region extractor for TypeScript/JavaScript and feed the extracted Markdown to MIEV's parser approach. Expand to other languages only after this source-mapping path is stable.
- Map parsed ranges back to document positions, including comment delimiters/prefixes, indentation, LF/CRLF, and multiline ranges.
- Assert that no decoration escapes a recognized comment region and that source text is never modified.
- After the prototype demonstrates the smallest useful reuse boundary, choose whether a fork-based workflow or selective adaptation will make upstream credit and future synchronization clearest.

**Exit criterion:** position mapping works for the fixture and its focused edge cases, with no dependency on MIEV's installed extension or undocumented activation state.

### 2. Lock down behavior before expanding features

- Specify behavior for block comments, single-line comments, trailing comments, cursor/selection visibility, and toggling. Keep click-to-edit as the initial interaction because it matches the workflow you value.
- Defer Escape-to-rendered-mode behavior, including the proposed left-edge cursor strategy, until after the first release; revisit it as a separate interaction feature.
- Defer `.md` rendering in `markdown-in-code`; recommend MIEV as the existing standalone Markdown option.
- Turn each remaining 0.0.8 behavior issue into a focused regression case: HTML comments, horizontal rules, list markers, multiline selection, edit/ESC behavior, and code-block styling.
- Keep parser and comment-extraction tests deterministic and fast. Cover comment delimiters, strings that contain comment-like text, nested or malformed regions, indentation, blank lines, and CRLF.
- Avoid combining unrelated cleanup (README, changelog, sample indentation/unused imports) with rendering changes.

### 3. Add real VS Code integration checks

- Run tests in the VS Code extension host, following MIEV's `@vscode/test-electron` setup.
- Verify activation, commands, editor switching, text edits, selections, cursor movement, and decoration updates.
- Expose a narrow test-only signal or API for waiting until decoration application completes; replace arbitrary fixed delays where possible.
- Assert calculated ranges and interaction state here. These checks are valuable but do not prove the final painted result.

### 4. Prototype screenshot regression testing

**Prerequisite feature slice: block-comment box presentation.** After Phase 3 establishes reliable extension-host checks, implement the box behavior below before approving screenshot baselines for block comments. The requirement is recorded now; rendering implementation is deferred until those integration checks exist.

- In rendered mode, hide the source block-comment delimiters and per-line formatting prefixes and display a box-style frame around the Markdown content. Preserve the original source exactly; click-to-edit and selections must reveal it, and leaving the comment must restore the frame.
- Interpret the requested character numbers as DOS/CP437 box-drawing codes: 196 = `─` (horizontal), 179 = `│` (vertical), 218 = `┌` (top-left), and 192 = `└` (bottom-left). Use the corresponding Unicode characters for display, not Unicode code points 196/179/218/192. These characters specify the top, left and bottom edges; right-edge/corner behavior remains a design detail to settle when implementing the box.
- Leave exactly one editor column of space between the leading `│` and the Markdown text. Test alignment with indentation, tabs, empty lines, and LF/CRLF.
- Support block-comment interior lines prefixed with ` * `, `* `, `//`, or no prefix, including mixed variants. Recognize their role within a compiler-recognized block comment without treating standalone source `//` comments as block comments or stripping meaningful Markdown list/emphasis syntax. Specify how indentation after a structural prefix is preserved for nested Markdown and code blocks.
- Cover supported block opening/closing forms, single-line and multiline blocks, blank lines, and incomplete comments. Confirm exact delimiter variants against fixtures when implementing; do not assume additional programming languages are in scope.
- Add extraction/mapping tests for prefix normalization, extension-host assertions for rendered/raw transitions and toggling, and visual checks for frame alignment, the one-column inset, selections and marker hiding. Prove a decoration-based frame is practical within VS Code's layout constraints before choosing its final width, wrapping and right-edge behavior.

- First perform a feasibility spike: capture a screenshot of a running VS Code editor from the current extension-host test flow. MIEV's existing E2E suite does not currently capture screenshot baselines; it checks parser output, decoration behavior, and other deterministic results.
- Evaluate a supported capture path for the launched VS Code/Electron process. The VS Code extension API does not itself provide a workbench screenshot API, so prove the capture mechanism before building a golden-image harness.
- Keep fixtures small enough to fit in a fixed editor viewport without scrolling. Use separate fixtures for distinct visual cases rather than one huge kitchen-sink document.
- Pin the screenshot job to a Linux runner image, VS Code/Electron version, theme, editor font, zoom, viewport size, and relevant settings. For example, a GitHub Actions Ubuntu runner can launch the VS Code test instance in a virtual display (such as Xvfb) and capture the editor window without a physical monitor.
- Keep unit and extension-host behavior tests runnable on Windows, macOS, and Linux where practical; only compare screenshot goldens on the pinned Linux environment. This gives broad portability without pretending cross-OS pixel output is identical.
- Compare captured images against checked-in baselines with a documented pixel-difference tolerance. On failure, retain the actual image and a diff image as artifacts.
- Require deliberate baseline updates and human review. A missing baseline must fail; tests must never silently create or approve a new expected image.
- Keep screenshot tests focused on visual outcomes (alignment, clipping, markers, colors, borders, and selection). Keep interaction semantics in explicit E2E assertions.

**Exit criterion:** a known intentional visual change produces a reviewable diff, while an intentionally introduced offset or missing marker reliably fails on the pinned runner.

### 5. Expand in small feature slices

**Deferred feature: fenced code inside block comments.** Render fenced content as a code region with an appearance opposite to the surrounding comment's light/dark presentation: for example, a dark code region inside a light comment block, and a light code region inside a dark comment block. Use foreground/background colors with readable contrast. Apply syntax coloring to the code text; a simplified token-color palette is acceptable. Use the fence's language identifier when available, and define a plain-code fallback for missing or unsupported languages. Preserve source text and the established click/selection/toggle behavior. Investigate VS Code decoration/tokenization constraints before selecting the implementation; fence-marker visibility, code-region boundaries and their interaction with the planned comment box need explicit behavior and visual tests. Until this slice is implemented, fenced code remains raw as specified in `docs/behavior.md`.

- Implement one behavior slice at a time: comment extraction/mapping, base inline formatting, block Markdown, edit/selection behavior, then advanced Markdown features.
- For each slice, add a focused parser/unit test, an integration assertion where state crosses the VS Code boundary, and a screenshot only when the risk is genuinely visual.
- Run focused checks after each change, then the complete validation suite before release.
- Keep the user-facing feature list honest about VS Code decoration limits (line-height changes, joined lines, and true inline images are not equivalent to rendered HTML).

## Regression Test Layers

| Layer | What it catches | What it cannot establish |
| --- | --- | --- |
| Unit tests for comment extraction and source mapping | Wrong regions, offsets, delimiters, CRLF, syntax-context edge cases | VS Code's final paint/layout |
| Parser/range tests | Incorrect Markdown recognition and decoration ranges | Whether decorations overlap, clip, or look right onscreen |
| VS Code extension-host tests | Commands, editor state, selections, updates, activation | Pixel-perfect visual output |
| Screenshot baselines | Position, clipping, marker appearance, colors, visual regressions | Why a pixel changed or whether a behavior is semantically correct |
| Human review of screenshot diffs | Whether a visual change is intended | Exhaustive behavior coverage |

The old `md-comments` decoration snapshots cover calculated ranges only. They are not screenshots, and the current helper creates a missing snapshot instead of failing, which can turn an absent expectation into a passing test. The replacement harness should make baseline generation an explicit command and fail on missing baselines.

## Decisions Confirmed

- Proceed independently rather than waiting for MIEV maintainer feedback; include clear credit and preserve MIT notices for reused code.
- Prioritize Markdown embedded in code. Standalone `.md` rendering is deferred, with MIEV as the recommended companion extension.
- Keep click-to-edit in the initial interaction design. Defer Escape-to-rendered-mode as a later feature.
- Start language support with TypeScript/JavaScript; consider additional languages in later milestones.
- Run ordinary tests across developer environments where practical, and run screenshot comparisons on a pinned Linux CI runner. The Linux runner is a standardized virtual machine provided by CI; it can run VS Code headlessly using a virtual display. Screenshot baselines are compared there, not expected to be pixel-identical on every local OS.

## Evidence Reviewed

- `md-comments/README.md`, especially its features, known issues, and 0.0.8 (Next) checklist.
- `markdown-inline-editor-vscode/AGENTS.md`, `package.json`, parser facade/core, language support, extension activation, decorator, and E2E suite.
- MIEV uses Vitest for unit tests and `@vscode/test-electron` for extension-host E2E tests. Its E2E suite exposes parser/decorator hooks for assertions, but the checked-in tests do not implement screenshot comparison.
- Both existing extensions declare MIT licensing. Any code reuse should preserve applicable license notices and attribution.
