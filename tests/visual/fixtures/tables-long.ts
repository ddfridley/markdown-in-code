export const outsideLongTable = true;
/**
 * 
 * 
 * | Order | Slice | Scope and completion check |
 * | --- | --- | --- |
 * | 1 | Headings and shared layout | ATX levels 1–6, Setext levels 1–2, marker hiding and a visible level hierarchy. Establish how larger text interacts with editor rows, frames, code bands and rules. Complete the feasibility and regression work below before other block slices. |
 * | 2 | Unordered lists | Replace recognized list markers with bullets; preserve nested indentation, inline formatting, continuation lines and meaningful stars. Test all comment-prefix forms against the heading layout. |
 * | 3 | Ordered lists and task lists | Define number presentation, starting values and nested alignment; display checked/unchecked tasks while retaining source editing as the interaction. Preserve code and escaped markers. |
 * | 4 | Blockquotes | Render quote markers and nested quotes with a consistent inset/bar; verify quotes containing headings, lists, code and rules. Reuse the established layout policy. |
 * | 5 | Links and autolinks | Define readable label/destination presentation and explicit link activation without breaking click-to-edit. Cover nested inline formatting, references and literal code contexts. |
 * | 6 | GFM tables | First prove column alignment, escaped pipes, inline formatting and narrow-viewport behavior within editor layout limits. Implement only the tested presentation; document fallbacks for unsupported layouts. User moved this ahead of HTML comments on October 20, 2026. |
 * | 7 | HTML comments in Markdown | After tables, decide the rendered presentation for embedded HTML comments and hide their structural markers where appropriate. Keep actual source-comment extraction separate and retain literal editing. General HTML rendering remains outside this slice. |
 * | 8 | Images and richer blocks | Investigate image labels/previews and explicit fallbacks first. Math, Mermaid and other embedded renderers require separate feasibility decisions and individual slices; they are not implicitly included. |
 * | 9 | More source languages | Add one language adapter at a time after the rendering contract stabilizes. Each needs compiler/tokenizer-backed comment extraction, delimiter/prefix mapping and syntax-context tests. |
 * | 10 | Release hardening | Verify wrapping, tabs, fonts, zoom, high contrast, minimap, split editors, horizontal scrolling and large-file performance across implemented features. Run the configured cross-platform CI, finalize packaging/docs and review remaining limitations. |

*/
