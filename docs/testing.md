# Testing

Select the version in `.nvmrc` through NVS before running npm commands. In this Windows setup, open Git Bash at the repository root and run:

```sh
source ./.bashrc
npm ci
npm run validate
npm run test:integration
```

`validate` runs strict TypeScript checking, 41 unit tests and the extension build, including the visual comparison gate's unit tests. `test:integration` builds both the extension and the integration runner, then runs 13 sequential checks inside an isolated VS Code extension host. The first integration run downloads VS Code **1.100.3**, matching the extension's minimum supported VS Code series. It does not use F5, the attach workaround, or port 9333. A temporary test window opens and closes automatically; leave it alone while checks run.

Each run creates its own workspace, user-data directory, and extensions directory under `.vscode-test/sessions/<timestamp>`. Installed user extensions are disabled only in that test application. Test edits affect fixture copies, not repository fixtures. The downloaded application and sessions are ignored by Git. VS Code logs remain in that session's `user-data/logs` directory for failed-run diagnosis.

The extension exposes a small `snapshot`/`onDidApply` API only in `ExtensionMode.Test`. It reports the editor's document version, language, selections and ranges after all decoration calls complete. Tests subscribe to completion events and assert expected states; they do not force a refresh or use fixed sleeps. Bounded timeouts fail when an expected update never arrives. Ordinary development and installed extension instances expose no test API.

Coverage includes activation and command registration; source-preserving heading/inline ranges; cursor reveal/restoration; reversed multiline selections and multiple carets; global toggle behavior; edits in rendered and raw modes; switching documents; split-editor visibility; Plain Text/TypeScript transitions; standalone Markdown exclusion; closing/reopening editor tabs; and untitled-document disposal. Closing a tab need not dispose its document immediately, so disposal is tested separately. Rendering-session unit tests additionally verify cache reuse and invalidation directly.

For a second VS Code version, set `VSCODE_EXECUTABLE_PATH` to an installed VS Code executable before running `npm run test:integration`. Such a run is an explicit override of the pinned version; the suite prints the actual version used.

The GitHub Actions workflow runs validation and integration on Windows, macOS and Linux. Linux uses Xvfb for the application display. Failed jobs upload test-session logs. The workflow has been authored but has not been run remotely; the verified local integration result is Windows with VS Code 1.100.3.

These unit/integration tests establish calls into VS Code and interaction state, including box visibility, source-prefix ranges, and tab-size layout updates. The separate [visual regression harness](visual-testing.md) now captures and compares six real editor images in a pinned Linux container. It includes intentional missing-border and offset rejection checks, explicit updates and failure artifacts. The baseline candidates need human review. Contrasting fenced-code rendering remains deferred.
