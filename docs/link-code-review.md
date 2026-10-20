# Link implementation review

Reviewed against the saved working commit `49bd4a1` on October 20, 2026. The working tree was clean before review. That commit remains the recovery point; no accepted screenshots or behavior contracts were changed.

The review covered link parsing and reference resolution (`links.ts`, `markdown.ts`), prose-color exclusions (`comment-text.ts`), presentation protection (`rendering.ts`), and activation, selection history, editor transfer, hint lifetime and event handling (`extension.ts`).

## Single cleanup

`openTarget` now requires its source editor and link position. Both callers already supply them. Removed the unused optional-source path and its redundant existence checks. No caller or intended behavior changed. This was the only production-code cleanup retained.

## Safeguards retained

- Click history outlives the reveal timer so delayed native activation can recover the original cursor.
- The pending timer distinguishes ordinary click-to-edit from native link activation. Pending selections also protect focus/theme/layout renders from briefly revealing source.
- Navigation pins preserve presentation after activation; gesture/focus grace periods handle late selection callbacks.
- Document version checks prevent stale offsets from protecting edited text. Editor-group checks preserve independent split editing when a tab receives a replacement editor instance.
- Full activation ranges and the one-column hit margin handle hidden destinations and native hit mapping. Deduplication prevents multiline labels from creating duplicate document links.
- Encoded command URI construction preserves Windows drive colons. Reference definitions and same-line comments need their own parsing behavior.
- Hint timers, version checks and disposal remove transient UI without changing source. Destination capture and opener-result tracking are used by different test modes.

No additional unused production declarations were reported by a TypeScript check with `noUnusedLocals` and `noUnusedParameters`. That extra whole-project check reported only intentional unused variables in sample fixtures; those fixtures were preserved.

## Verification and outstanding review

After the cleanup, validation passed all 98 unit tests, typechecking and build; integration passed 21 checks; the heading-contract mutation self-test passed. Native navigation passed on pinned VS Code 1.100.3 and installed 1.142.0, including 33 Ctrl+clicks per version with transient-reveal monitoring, actual local-file opening and return, delayed activation, ordinary click-to-edit, explicit navigation and editing. The opt-in three-page real-browser sequence also passed on installed 1.142.0, including opener success and rendered source after focus return. Real mail-client focus transitions remain untested.

Some native runs intermittently timed out on ordinary click-to-edit after local-tab return. Standalone reruns passed. Assertions were preserved rather than weakened; the timing failure remains a test reliability observation.

Screenshot runs with the cleanup and with the exact saved commit produced identical SHA-256 hashes for all 23 preliminary images. Both show existing bullet differences in `block-light`, `block-narrow-light`, `block-dark`, `unordered-lists-light` and `unordered-lists-dark`; `links-light` and `links-dark` still have no accepted baselines. Sixteen cases match accepted images. The visual mutation self-test stops at its clean-comparison prerequisite, so its three deliberate mutations were not exercised.

Review [the cleanup capture](../tests/visual/preliminary/1792520577465/index.html) against [the saved-commit capture](../tests/visual/preliminary/1792520660714/index.html). Their output is identical. The post-reapply visual self-test capture is [run 1792520725803](../tests/visual/preliminary/1792520725803/index.html). Accepted images remain unchanged; this review does not approve them.

Test logs are in `.vscode-test/review-*.log`. No temporary source copies were needed or left behind. On October 20, 2026, the user approved these screenshots and confirmed Ctrl+click functionality in F5. Promoted the 23 exact images from run 1792520725803; earlier pending-review statements above describe the state during the audit.
