# Chat Summary: Markdown in Code

## Starting Point

The workspace contains three relevant projects:

- `markdown-in-code`: the intended destination for the new work; initially empty.
- `markdown-inline-editor-vscode` (MIEV): a more mature VS Code extension that renders Markdown inline in `.md` files.
- `md-comments`: an earlier extension intended to render Markdown in source-code comments and Markdown files.

The goal is to build a reliable extension for Markdown embedded in code, learning from MIEV while addressing the regressions and workflow problems encountered in `md-comments`.

## Findings

- The `md-comments` README describes Markdown rendering in block, single-line, and trailing comments, plus click-to-edit, a toggle command, and Escape behavior. Its 0.0.8 backlog includes visual regression tests, selection/edit behavior, list markers, HTML comment handling, horizontal rules, and sample/documentation cleanup.
- MIEV has a more capable Markdown parser and decoration system, with unit tests and VS Code extension-host E2E tests. Its parser accepts Markdown text and returns position-based decoration ranges, which could be adapted for comment regions.
- MIEV's parser and decorator are internal modules, not a supported package API; its package is private. The installed extension should not be treated as a runtime dependency.
- `md-comments`' existing snapshot tests serialize computed decoration ranges, not actual rendered pixels. They also create a missing expected snapshot automatically, so they do not provide a robust visual approval gate.
- MIEV's checked-in E2E suite does not currently capture and compare screenshots.

## Decisions

- Develop `markdown-in-code` independently rather than waiting for an upstream response. Give MIEV and its author clear credit and preserve relevant MIT license/copyright notices for reused code.
- Start with TypeScript/JavaScript source comments. Expand language support after comment extraction and source-position mapping are reliable.
- Focus the first release on Markdown embedded in code. Standalone `.md` support is deferred; users can install MIEV for that experience.
- Keep click-to-edit in the initial interaction design. Defer Escape-to-rendered-mode as a later feature.
- Run ordinary tests across developer environments where practical. Run screenshot comparisons on a pinned Linux CI runner, because pixel output can vary across OS, fonts, and Electron versions. The Linux runner is a standardized CI virtual machine and can run VS Code headlessly using a virtual display.

## Recommended Next Milestone

1. Establish the extension manifest, build, and test harness in this repository.
2. Build a small TypeScript/JavaScript fixture with code around block, standalone line, and trailing comments.
3. Prototype extracting Markdown from comments, parsing it with MIEV's parser approach, and translating decoration offsets back to the original document.
4. Test delimiters, indentation, strings containing comment-like text, malformed comments, and LF/CRLF. Ensure decorations never escape comment regions and source text is not changed.
5. Decide whether a fork-based workflow or selective adaptation is the clearest maintainable reuse strategy after the prototype proves the boundary.
6. Separately spike screenshot capture in the extension-host test environment before committing to a screenshot baseline framework. Keep parser, behavior, and visual tests as distinct layers.
