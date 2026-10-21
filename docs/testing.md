# Testing

Current verification: 110 unit tests, typecheck/build, 26 real VS Code integration checks and the 33-activation native link suite pass. Escape integration checks cover unchanged cursor/viewport, edit and movement release, toggling, selections, language changes and split isolation. Real keyboard checks pass on VS Code 1.100.3 and installed 1.142.0 for Find dismissal, Escape rendering and click/arrow release; see [Escape checks](escape.md). The screenshot suite has 29 cases: all 29 images are approved, including the long, wrapped and horizontally scrolled plan table. Table tests cover LF/CRLF mapping, alignment, omitted outer pipes, inline/link composition, escaped pipes, empty cells, source reveal, edits, toggle and explicit layout fallbacks. See [table review steps](tables.md). Historical counts below describe earlier slices.

Select the version in `.nvmrc` through NVS before running npm commands. In this Windows setup, open Git Bash at the repository root and run:

```sh
source ./.bashrc
npm ci
npm run validate
npm run test:integration
```

`validate` runs strict TypeScript checking, 78 unit tests and the extension build, including the visual comparison gate's unit tests. `test:integration` builds both the extension and the integration runner, then runs 17 sequential checks inside an isolated VS Code extension host. The first integration run downloads VS Code **1.100.3**, matching the extension's minimum supported VS Code series. It does not use F5, the attach workaround, or port 9333. A temporary test window opens and closes automatically; leave it alone while checks run.

Each run creates its own workspace, user-data directory, and extensions directory under `.vscode-test/sessions/<timestamp>`. Installed user extensions are disabled only in that test application. Test edits affect fixture copies, not repository fixtures. The downloaded application and sessions are ignored by Git. VS Code logs remain in that session's `user-data/logs` directory for failed-run diagnosis.

The extension exposes a small `snapshot`/`onDidApply` API only in `ExtensionMode.Test`. It reports the editor's document version, language, selections and ranges after all decoration calls complete. Tests subscribe to completion events and assert expected states; they do not force a refresh or use fixed sleeps. Bounded timeouts fail when an expected update never arrives. Ordinary development and installed extension instances expose no test API.

Coverage includes activation and command registration; source-preserving heading/inline ranges; cursor reveal/restoration; reversed multiline selections and multiple carets; global toggle behavior; edits in rendered and raw modes; switching documents; split-editor visibility; Plain Text/TypeScript transitions; standalone Markdown exclusion; closing/reopening editor tabs; and untitled-document disposal. Closing a tab need not dispose its document immediately, so disposal is tested separately. Rendering-session unit tests additionally verify cache reuse and invalidation directly.

For a second VS Code version, set `VSCODE_EXECUTABLE_PATH` to an installed VS Code executable before running `npm run test:integration`. Such a run is an explicit override of the pinned version; the suite prints the actual version used.

The GitHub Actions workflow runs validation and integration on Windows, macOS and Linux. Linux uses Xvfb for the application display. Failed jobs upload test-session logs. The workflow has been authored but has not been run remotely; the verified local integration result is Windows with VS Code 1.100.3.

These unit/integration tests establish calls into VS Code and interaction state, including box visibility, source-prefix ranges, and tab-size layout updates. The separate [visual regression harness](visual-testing.md) now captures and compares twenty-three real editor images in a pinned Linux container. It includes intentional missing-border and offset rejection checks, separate preliminary/accepted images, interactive human acceptance and failure artifacts. The fenced-code and horizontal-rule slices, including their baselines and F5 behavior, were approved by the user on 2026-10-17; future baseline changes still require review. Fenced-code checks cover syntax ranges, literal Markdown, click/restore, toggling and theme changes; see [fenced-code behavior](fenced-code.md).

Heading checks cover ATX/Setext mapping, inline formatting, literal contexts, row-height budgets, size preservation under wrapping, configuration updates, edits, reveal/restoration and toggling. See [heading behavior](headings.md).

Screenshot run `1792271623561` was explicitly approved by the user and promoted; future visual changes must fail comparison until separately reviewed. Unit contracts are independent of image approval. See [the review workflow](visual-testing.md); never regenerate expectations to make a failing comparison pass.

Unordered-list checks cover marker variants, nesting/continuations, comment-prefix ambiguity, literal contexts, reveal/toggle behavior and edits while disabled. The user approved run 1792277196123; all seventeen images were promoted and compared successfully.

Ordered/task checks cover starting values, independent nested numbering, checked/unchecked and ordered tasks, LF/CRLF mapping, literal contexts and prose-color exclusion. A real VS Code check exercises source reveal, toggling and checkbox edits while disabled. The user approved light/dark screenshots in run 1792430470412.

Blockquote checks cover explicit/nested/lazy marker mapping, LF/CRLF, literal contexts, contained headings/Setext/lists/tasks/rules and quoted code tokens. A real VS Code check verifies source reveal, source preservation, toggle restoration and edits while disabled. See [the blockquote checks](blockquotes.md).

The user approved blockquote run `1792441995622`; all twenty-one cases are recorded in the acceptance manifest.

Link tests cover inline/reference/autolink ranges, LF/CRLF, first-definition behavior and isolation, nested formatting, quoted labels, literal contexts, target resolution and interaction restoration. A real VS Code check opens a temporary local file through the explicit command, without launching a browser or mail client.

Same-line, lone and trailing comment links now render too. Native document-link provider checks cover labels and targets. The pinned screenshot host sends actual ordinary/Ctrl mouse clicks to a local link and verifies ordinary source reveal versus navigation with the original selection/rendering preserved. Link mouse selection has a 200 ms reveal delay to allow native activation to cancel it.

`npm run test:navigation` exercises ten link formats with actual mouse events in an isolated window. Browser/mail destinations are captured by a test-mode-only hook, so no external application opens. Each activation must retain the source cursor and rendered state after 500 ms; plain click must reveal without activation. `VSCODE_EXECUTABLE_PATH` selects an installed version. Verified on Windows with installed VS Code 1.142.0 in addition to the pinned screenshot host's local-link check. This caught premature command-URI decoding of Windows drive colons that Linux-only mouse tests missed. Definition destinations now participate in the same native-link handler.

The ten-format suite also passes on Windows with pinned VS Code 1.100.3 and is configured in the Windows CI job, with navigation logs retained on failure. The updated CI workflow has not been run remotely.

The native mouse suite now includes 33 activations across eleven labels at three horizontal positions, with physical line-26 clicks between rounds, exactly-one-open checks and delayed activation. It reproduces the previously missed first-bold-glyph hit and repeated-navigation cursor failure. Expanded checks pass on Windows with VS Code 1.100.3 and 1.142.0. The bridge rechecks its request-id set after asynchronous reads so filesystem notifications cannot dispatch duplicate mouse clicks. Rendering-only updates no longer overwrite the saved selection; native and selection handling share the same full-syntax hit range and one-column margin.

Three independent presentation tests verify that native navigation can keep its comment rendered despite an incidental caret inside it, without protecting another comment/split, a changed version or a disabled session. Real editor checks verify intentional navigation and edits release that protection. The opt-in `MIC_NAVIGATION_EXTERNAL=1` navigation test launches three real browser pages using only isolated-profile trusted domains, checks opener results and render/cursor state through a focus return, and requires an actual focus transition. Verified with installed Windows VS Code 1.142.0; default automation captures destinations. Real mail-client focus behavior remains unverified. Validation now passes 98 unit tests and 21 real VS Code integration checks.
