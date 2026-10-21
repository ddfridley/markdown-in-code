# Escape to render the current comment

Clicking inside a Markdown comment still reveals its source. With one empty caret inside that comment, press **Escape** to render it again without moving the caret or requesting a scroll. **Markdown in Code: Render Current Comment** in the Command Palette performs the same action.

The command protects only that comment in that editor and document version. Another split keeps its own source/rendered state. Moving the caret, making a selection, clicking to place it again or editing the document releases the protection. Turning rendering off clears it; Escape does not enable rendering while the global toggle is off. Hiding/closing the editor or changing its document/language also releases it.

The Escape binding is active only for a single caret in a revealed supported comment with rendering enabled. It does not take over normal selection or multicursor cancellation. Suggestions, inline suggestions, Find, parameter hints, rename, code-action menus, snippets, reference search, hover, notifications and composition retain their Escape behavior. Dismiss those first; an additional Escape can then render the comment. The explicit palette command remains available when the shortcut is ineligible.

Typing uses the real source caret: it resumes raw editing and applies the edit there. No source text is rewritten by Escape. As with click-to-edit, a click must produce a selection event to release presentation protection; caret movement also resumes source editing.

**Same-position click limitation:** after Escape renders a comment, clicking the exact same caret position may leave it rendered because VS Code does not report an unchanged selection. Click a different column on the same line or press an arrow key to resume editing; another line is not required. Escape remains a render-only action, not a two-way toggle. The user explicitly chose to retain this behavior rather than introduce cursor movement, timing workarounds or a second-Escape editing action.

## F5 check

1. Reload the development window using **Developer: Reload Window**, then open root `demo.ts`.
2. Click a line in the opening documentation, such as `#### Try it`. Its complete comment should reveal its source.
3. Press Escape. Formatting should return at the current viewport without jumping to the bottom of the comment. The source caret stays in place.
4. Press an arrow key or click a different caret position to edit again. Clicking the identical position may keep the comment rendered. Press Escape to restore rendering; pressing it again does not switch back to editing. Typing should also reveal source and make the edit normally; undo your test edit afterward.
5. Open Find with Ctrl+F. Escape should dismiss Find first. If there is a selected match or a notification, further Escape presses perform those normal editor actions before rendering.
6. Toggle rendering off: Escape must leave source visible. Toggle on, then check the same document in two splits; Escape in one must not render the other's selected comment.

The existing rendering-session protection is used for the presentation result, with separate Escape state from native link navigation. Integration tests cover cursor/viewport preservation in a 70-row comment, movement/edit release, toggle, selection preservation and splits. The native suite sends physical Escape/arrow events and checks Find precedence and click-to-edit alongside the existing Ctrl+click checks.

Verified: 110 unit tests, typecheck/build and 26 integration checks pass. Physical keyboard/mouse checks pass on pinned VS Code 1.100.3 and installed 1.142.0. All 29 accepted screenshots match in run 1792541901987; an earlier run differed only in the transient horizontal scrollbar of the long-table case. Accepted images and independent behavior contracts were not changed. The user confirmed F5 behavior, including no observed conflicts with Open File, Ctrl+P or Ctrl+Shift+P, and accepted the same-position click limitation. No new screenshot approval is required for this feature.
