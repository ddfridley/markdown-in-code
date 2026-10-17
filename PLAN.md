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

The fenced-code slice is committed as `5809e19`. The user approved the horizontal-rule slice after manual testing on 2026-10-17; the completed slice includes source, tests, docs and its reviewed screenshot. Verified checks: type checking/build, 54 unit tests, 15 real VS Code checks, ten screenshot comparisons and both deliberate regression checks. Heading typography and layout are next, as requested, before adding more block features. See the ordered feature-slice plan in Phase 5 below.

#### Earlier implementation milestones

The entries below record earlier states; the current status and Phase 5 feature order supersede their old next steps and deferred-feature notes.

2026-10-17: the user approved the fenced-code screenshots and confirmed F5 rendering works, including minimap centering and consistent backgrounds. This slice passes type checking/build, 50 unit tests, 14 real VS Code checks, nine screenshot comparisons and both intentional regression checks. Next feature slice: render Markdown horizontal rules within framed comments, while preserving raw editing, source text and literal code/HTML contexts.

Fixed language-label centering with the minimap enabled: the query container now uses the text viewport rather than its wider scrollable parent. Added a ninth screenshot with both sidebar and minimap enabled. Background fixes remain in place.

Corrected fenced backgrounds to start at the same frame column on blank, star-prefixed and unprefixed rows. Language labels now use an editor-scoped CSS query container rather than window width. Added an eighth screenshot with the Explorer sidebar open; all eight comparisons pass, alongside 50 unit tests and 14 real VS Code checks. The user approved the prior fenced light/dark images; these refined candidates remain available for review. Split/horizontal-scroll visual coverage remains future work.

Fixed fenced-code background seams at text ends and below hidden fence markers by using one continuous full-height background per row. Expanded light/dark visual fixtures to cover star-prefixed blocks, unprefixed blocks and grouped line comments.

Fenced opening/closing rows now render as matching code-palette horizontal bars, with expanded known language names on the opening bar. Window-based label centering is verified in the pinned single-editor light/dark screenshots; exact centering with sidebars, split editors and horizontal scrolling remains a follow-up. The positioning uses Monaco CSS through decoration attachments; see `docs/fenced-code.md`.

The Phase 5 fenced-code slice is implemented: contrasting opposite-theme backgrounds, simplified JavaScript/TypeScript token colors, plain-code fallback, hidden fence delimiters and preserved editing behavior. See `docs/fenced-code.md`. Type checking, build, 49 unit tests, 14 real VS Code checks, all seven screenshot comparisons and both deliberate regression checks pass locally. New fenced light/dark baseline candidates await human review; remote CI remains unverified. Earlier status entries below record prior milestones.

The screenshot clip now excludes the measured right-side scrollbar/overview-ruler gutter in all themes and viewport sizes. All six baseline candidates were regenerated with that crop and all six Linux comparisons pass. The editor's normal rendering is unchanged.

Phase 4's automated screenshot gate is implemented and verified locally using Docker Desktop's Linux engine. Six images cover light/dark frames, selection revealing source, a narrow viewport, standalone `//` groups and current raw fenced code. The pinned amd64 container freezes its Node image digest, Debian dependency/font snapshot, VS Code/Electron 1.100.3, DejaVu font, viewport, scale and settings. All six normal comparisons pass; deliberately missing borders and two-pixel marker offsets each fail five cases with reviewable actual/expected/diff artifacts. Missing baselines fail and normal runs mount expected images read-only. Explicit update commands produced six initial baseline candidates; human review/approval remains outstanding. CI is configured but remote execution is unverified. See `docs/visual-testing.md` for the gallery and commands. Type checking, 41 unit tests and the build pass; the 13 extension-host behavior checks remain in the validation suite. Next: review the initial baseline candidates, then Phase 5 feature slices, including the recorded contrasting fenced-code presentation.

Same-line `/* … */` comments are inline comments for rendering: no frame, visible source delimiters, and inline Markdown styling (including `**Inline comment**` as bold). This supersedes the earlier compact-frame behavior; multiline comments and grouped standalone `//` blocks retain their frames. Type checking, the build, 38 unit tests and 13 real VS Code checks pass.

Viewport rules and standalone-comment groups are implemented. Horizontal frame strokes now extend to the editor's right edge using clipped, layout-compensated attachments; normal and narrow viewport captures were inspected. Consecutive standalone `//` lines with whitespace-only left margins form one framed Markdown block, including headings and multiline formatting. Blank source lines/code/trailing comments break groups, while empty `//` rows remain in the group. The entire group shares edit/selection/toggle state. Validation passed 37 unit tests, 12 real VS Code checks, type checking and the build. The representative new fixture is `tests/fixtures/line-blocks.ts`. This supersedes the earlier independent-line-comment and content-width-border behavior. Linux screenshot baselines remain next.

The block-comment frame slice is implemented: open-right `┌─ / │ / └─` borders, a one-column inset, hidden structural source syntax, mixed star/slash/no-prefix normalization, common indentation and tab-size alignment, compact inline blocks and incomplete-comment handling. Frames follow existing editing, selection, split-editor and toggle behavior, including plain comments without Markdown. Validation passed TypeScript checking, 32 unit tests, the build and 11 real VS Code checks on Windows/VS Code 1.100.3. A workbench screenshot was captured through a local Chromium debugging endpoint and visually inspected for the mixed-prefix/tab fixture. See `docs/comment-boxes.md`. That capture proves a local capture path, not baseline regression coverage. Next: Phase 4's pinned Linux capture/comparison harness; expanded frame visual cases and contrasting fenced-code rendering remain outstanding.

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

**Prerequisite feature slice: block-comment box presentation (implemented; visual baseline approval pending).** The implementation and its tested limits are documented in `docs/comment-boxes.md`. The requirements below remain the reference for screenshot coverage and follow-up refinements.

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

**Completed and manually approved:** comment frames, grouped standalone comments, base inline formatting, fenced code with opposite-theme syntax colors and labeled bars, and Markdown horizontal rules. Heading recognition exists, but titles still use the editor's font size and Setext underlines remain visible.

**Next: headings (headers).** Finish heading typography and settle its layout effects before increasing the number of rendered block features. This order was requested by the user on 2026-10-17. The remaining sequence is a working implementation order; later advanced features depend on the layout findings rather than a promise that editor decorations can reproduce HTML.

| Order | Slice | Scope and completion check |
| --- | --- | --- |
| 1 | Headings and shared layout | ATX levels 1–6, Setext levels 1–2, marker hiding and a visible level hierarchy. Establish how larger text interacts with editor rows, frames, code bands and rules. Complete the feasibility and regression work below before other block slices. |
| 2 | Unordered lists | Replace recognized list markers with bullets; preserve nested indentation, inline formatting, continuation lines and meaningful stars. Test all comment-prefix forms against the heading layout. |
| 3 | Ordered lists and task lists | Define number presentation, starting values and nested alignment; display checked/unchecked tasks while retaining source editing as the interaction. Preserve code and escaped markers. |
| 4 | Blockquotes | Render quote markers and nested quotes with a consistent inset/bar; verify quotes containing headings, lists, code and rules. Reuse the established layout policy. |
| 5 | Links and autolinks | Define readable label/destination presentation and explicit link activation without breaking click-to-edit. Cover nested inline formatting, references and literal code contexts. |
| 6 | HTML comments in Markdown | Decide the rendered presentation for embedded HTML comments and hide their structural markers where appropriate. Keep actual source-comment extraction separate and retain literal editing. General HTML rendering remains outside this slice. |
| 7 | GFM tables | First prove column alignment, escaped pipes, inline formatting and narrow-viewport behavior within editor layout limits. Implement only the tested presentation; document fallbacks for unsupported layouts. |
| 8 | Images and richer blocks | Investigate image labels/previews and explicit fallbacks first. Math, Mermaid and other embedded renderers require separate feasibility decisions and individual slices; they are not implicitly included. |
| 9 | More source languages | Add one language adapter at a time after the rendering contract stabilizes. Each needs compiler/tokenizer-backed comment extraction, delimiter/prefix mapping and syntax-context tests. |
| 10 | Release hardening | Verify wrapping, tabs, fonts, zoom, high contrast, minimap, split editors, horizontal scrolling and large-file performance across implemented features. Run the configured cross-platform CI, finalize packaging/docs and review remaining limitations. |

#### Heading slice implementation plan

1. **Define the heading contract.** ATX headings get levels 1–6; Setext headings get levels 1–2. Both hide their Markdown structural markers while rendered, including optional closing hashes. Keep inline emphasis/code inside headings, preserve literal/escaped examples, and limit block heading presentation to framed comments. Source text, click/selection reveal, toggle and independent split-editor state remain unchanged.
2. **Prototype typography before committing to a scale.** Try a clear descending size hierarchy, starting with H1 at 1.5×, H2 at 1.3×, H3 at 1.15× and H4–H6 at editor size with weight/color distinctions. These are starting values for visual review, not a final contract. VS Code's supported decoration API has no font-size or per-line-height option. Evaluate the CSS-based approach against the pinned VS Code version and F5, including whether glyphs overlap or clip. Do not mistake larger glyphs for an actual increase in editor row height, and do not change the user's global line-height setting to make the demo pass.
3. **Choose and document a feasible shared layout.** Preserve source rows and source-to-decoration mapping. Determine how heading baselines, bounds and any spacing fit the editor row grid. If larger text cannot render safely, record the measured limitation and a concrete fallback/alternative before extending other block features; keep that decision explicit rather than silently retaining same-size headings. Resolve Setext underline-row presentation without changing source or breaking cursor positions.
4. **Regress existing blocks immediately.** Put headings immediately before/after fenced code and horizontal rules, plus adjacent headings and headings at comment-frame edges. Check frame joins, one-column inset, code backgrounds/bars, label centering, selections, toggles and restoration. Include light/dark themes, sidebar/minimap, narrow and split editors, default/custom line heights, zoom, tabs, LF/CRLF and wrapped/long titles. Reuse existing fixtures where possible; add focused mixed-block cases before expanding the gallery further.
5. **Validate and review.** Unit tests must cover levels, ATX/Setext distinction, marker mapping, nested formatting and code/HTML exclusions. Real VS Code checks must cover reveal/restoration, edits, toggling and source preservation. Screenshot tests must demonstrate the chosen hierarchy and mixed-block layout; intentional regressions must still fail. Document exact F5 lines, record user review, and commit the completed slice before beginning lists.

**Heading exit criterion:** the agreed heading hierarchy renders without clipping, overlap, misplaced frames or regressions in existing code/rules, with an explicit documented decision about row-height limitations. The current same-size behavior remains the implementation until this slice is built and verified.

For every later slice, define its behavior first, add focused mapping tests, add real VS Code assertions where editor state changes, and add screenshots for visual risks. Run focused checks during implementation and the complete validation suite before release. Keep standalone `.md` support and Escape-to-render interaction deferred as already agreed.

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
