# Unordered lists in comments

Parser-recognized `-`, `+` and `*` list markers become `•` bullets in rendered multiline block comments and grouped standalone `//` comments. Only the marker character is replaced visually; indentation, tabs, following whitespace, continuation rows and source text stay intact. Nested lists keep their source indentation. Bold, italic and inline code remain available in item text, and bullets use the same theme-gray palette as ordinary prose.

Ordered lists and task lists have [separate behavior and fixtures](ordered-tasks.md), so this slice does not approve their appearance. Focused unit tests ensure their markers are not mistaken for unordered bullets. Thematic breaks remain rules. Escaped markers, fenced/indented code and HTML remain literal, as do lone/trailing line comments and same-line block comments. Comment-prefix extraction retains meaningful star bullets rather than consuming them as structural prefixes.

Clicking or selecting a comment reveals its complete source. Leaving restores bullets; toggling and editing while toggled off follow the existing behavior. Soft-wrapped continuation rows retain the existing frame/inset limitations; this feature does not implement HTML list layout.

## Manual check

Reload F5 and open `tests/fixtures/unordered-lists.ts`.

1. Press Ctrl+G, enter `1:1`, then press Enter. Lines 4, 6, 7, 9 and 11 should show bullets instead of their dash/plus/star markers. Lines 6 and 7 should be progressively indented; line 5 should align with the parent text. Bold, italic and inline-code styling should remain visible.
2. Line 13 should remain a horizontal rule. The dash inside the fenced code on line 15 must remain literal.
3. Lines 19–20 should show nested bullets in the grouped line-comment frame. Line 22 should retain the inline-comment marker.
4. Click line 4 before `Parent`. The entire block should reveal its original Markdown. Return to `1:1` to restore rendering. Toggle rendering off, edit an item, toggle on, and leave the comment to check that the updated item renders.

Unit coverage includes LF/CRLF mapping, nested/continuation indentation, prefix variants, literal contexts, gray-text exclusion and reveal/toggle state. Real VS Code checks cover nested bullet ranges, source preservation and edits while disabled.

The user approved run `1792277196123`, including the two new light/dark images and three changed frame images. All seventeen images are recorded in the acceptance manifest. Ordered/task lists will have their own review.
