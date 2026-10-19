# Ordered and task lists

In framed block comments and grouped standalone line comments, ordered lists show sequential numbers starting at the first source number. Both `3.` and `3)` render as `3.`; subsequent source markers such as `1)` display the next number. Each nested list starts its own sequence. Markdown parsing determines whether a line belongs to a list: a nested list starting above one can need a preceding blank comment row.

Task items show an unchecked `☐` or checked `☑` box for `[ ]`, `[x]` and `[X]`. Unordered task syntax becomes a checkbox and one following space; ordered tasks retain their sequential number before the checkbox. Boxes are visual markers, not clickable controls. Click to reveal source, then edit the bracket contents. Completed task text keeps its normal formatting rather than acquiring an implicit strikethrough.

Source indentation, continuation lines and inline formatting remain intact. Number replacements use the source marker's width; if automatic numbering adds more digits than the source reserves, labels can crowd the following text. Add enough digits/spacing in source to reserve the desired width. This extension decorates editor text and does not implement HTML list reflow. Soft wrapping retains the existing comment-frame limitations.

Fenced/indented code, escaped markers, HTML and unframed lone/trailing comments remain literal. Rendering does not edit source or mark the document dirty. Selection, leaving a comment, toggling and edits while disabled use the existing interaction behavior.

## Manual check

Reload F5 and open `tests/fixtures/ordered-tasks.ts`.

1. Press Ctrl+G, type `1:1`, and press Enter. Lines 4–5 should display `3.` and `4.`. Lines 7–8 should display nested `7.` and `8.`. The original `)` delimiters should be hidden.
2. Lines 10–11 should show unchecked and checked boxes. Line 13 should show a nested checked box. Lines 15–16 should show numbered tasks with boxes. Item text should have one space after the checkbox.
3. Lines 19–20 are fenced code: their numbers and brackets must remain literal. Lines 24–25 should number the grouped comments `1.` and `2.`.
4. Click before `Pending` on line 10. The entire block should show its original source, including `- [ ]`. Change the blank bracket to `[x]`, then return to `1:1`; it should show a checked box. Toggle off, change it back, toggle on and leave the comment to verify restoration.

Unit tests cover independent numbering, nested lists, ordered tasks, LF/CRLF mappings, literal contexts, prose-color exclusion and source reveal/toggling. A real VS Code test covers source preservation and checkbox edits while disabled. Separate light/dark screenshots require human review before acceptance.

The user approved run `1792430470412`; all nineteen images are recorded in the acceptance manifest, including the two new ordered/task-list cases.
