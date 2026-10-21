import * as vscode from 'vscode';
import type { Style } from './markdown';
import { RenderingSession } from './rendering';
import type { AppliedState, TestApi } from './test-api';
import { CODE_PALETTES, CODE_STYLES, type CodeStyle } from './fenced-code';
import { headingLayout } from './headings';
import { nativeViewportWidthRules } from './viewport-width';
import { commentText } from './comment-text';
import { parseComments } from './markdown';
import { resolveLink } from './links';
import { extractComments } from './comments';

const languages = new Set(['javascript', 'typescript', 'javascriptreact', 'typescriptreact']);
/**
 * ## linkHitRange(document, span) ⇒ {vscode.Range}
 * Give native links the same hit margin used by click detection so a boundary glyph cannot bypass our activation path.
 *
 * **Kind:** function
 * **Access:** private
 *
 * ## Parameters
 * - `document` **{vscode.TextDocument}** - Source document for offset/line conversion.
 * - `span` **{Span}** - Full source activation syntax, not merely the visible label.
 *
 * ## Returns
 * **{vscode.Range}** - Range expanded by one neighboring column where the source row permits it.
 *
 * ## Implementation Details
 * After hidden Markdown syntax collapses, Monaco can map the first visible glyph to the preceding source column. Expansion never crosses a source-row boundary.
 *
 * ## Agent Notes
 * Use this helper in both the document-link provider and selection detection. The small native underline extension is a documented, reviewed tradeoff.
 */
function linkHitRange(document: vscode.TextDocument, span: { start: number; end: number }): vscode.Range {
  const start = document.positionAt(span.start);
  const end = document.positionAt(span.end);
  return new vscode.Range(start.character ? start.translate(0, -1) : start,
    end.character < document.lineAt(end.line).text.length ? end.translate(0, 1) : end);
}

/**
 * ## activate(context) ⇒ {TestApi | undefined}
 * Connect pure comment presentation to VS Code without confusing document-wide caches with editor-local interaction state.
 *
 * **Kind:** function
 * **Access:** public
 *
 * ## Parameters
 * - `context` **{vscode.ExtensionContext}** - Activation mode and owner of commands, listeners, timers and decoration disposables.
 *
 * ## Returns
 * **{TestApi | undefined}** - Narrow observation API in test mode; no API in normal development/installed mode.
 *
 * ## Implementation Details
 * Native selection events do not expose modifier keys or every same-position click. Click history, pending reveal timers, navigation pins and Escape pins therefore represent different lifetimes and intentions. Theme/layout callbacks must not replace pre-click history.
 *
 * ## Agent Notes
 * Do not merge these states merely because their fields overlap. CSS-based attachment geometry depends on Monaco behavior and decoration registration order; prove changes with real input and pinned screenshots, not snapshots alone. Accepted baselines require human approval.
 */
export function activate(context: vscode.ExtensionContext) {
  const testing = context.extensionMode === vscode.ExtensionMode.Test;
  const openedLinks: string[] = [];
  const linkOpenResults: { uri: string; result: boolean }[] = [];
  const openedHint = vscode.window.createTextEditorDecorationType({ after: {
    color: new vscode.ThemeColor('editorHoverWidget.foreground'),
    backgroundColor: new vscode.ThemeColor('editorHoverWidget.background'),
    border: '1px solid', borderColor: new vscode.ThemeColor('editorHoverWidget.border'),
    margin: '0', fontStyle: 'normal', fontWeight: 'normal',
    // Remove the attachment from line layout and paint it above its anchor.
    // VS Code has no public API for a timed popup at a document position.
    textDecoration: 'none; position: absolute; transform: translateY(-100%); z-index: 100; pointer-events: none; white-space: nowrap; width: max-content; max-width: 80vw; overflow: hidden; text-overflow: ellipsis;'
  } });
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let hintEditor: vscode.TextEditor | undefined;
  /**
   * ## clearOpenedHint() ⇒ {void}
   * Make transient open feedback replaceable and disposable without leaving an old timer able to clear a newer hint.
   *
   * **Kind:** function
   * **Access:** private
   *
   * ## Parameters
   * None.
   *
   * ## Returns
   * **{void}** - Cancels the current timer and removes its editor decoration.
   *
   * ## Implementation Details
   * A successful new open calls this before installing feedback; source edits and extension disposal also use the same cleanup.
   */
  function clearOpenedHint() {
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = undefined;
    hintEditor?.setDecorations(openedHint, []);
    hintEditor = undefined;
  }
  context.subscriptions.push(openedHint, { dispose: clearOpenedHint });
  /**
   * ## openTarget(target, source) ⇒ {Promise<void>}
   * Open an explicitly activated destination and show success feedback only when the external opener reports success.
   *
   * **Kind:** async function
   * **Access:** private
   *
   * ## Parameters
   * - `target` **{{kind: "external" | "editor", uri: string}}** - Resolved target from the pure destination policy.
   * - `source` **{{editor: vscode.TextEditor, start: number}}** - Source editor and label offset anchoring the two-second confirmation.
   *
   * ## Returns
   * **{Promise<void>}** - Completes after the opening request; opener/command errors propagate. Canceled external opens show no success hint.
   *
   * ## Implementation Details
   * Version/closed-document checks prevent a delayed opener from attaching feedback to changed text. The browser may remain behind Code, so feedback confirms activation without trying to steal OS focus.
   *
   * ## Agent Notes
   * Captured external targets in test mode are not real browser/mail opens. Windows foreground behavior and trusted-domain prompts belong to VS Code/OS settings; do not add shell focus tricks.
   */
  async function openTarget(target: { kind: 'external' | 'editor'; uri: string }, source: { editor: vscode.TextEditor; start: number }) {
    const sourceVersion = source.editor.document.version;
    if (testing) openedLinks.push(target.uri);
    if (testing && process.env.MIC_CAPTURE_LINKS === '1' && target.kind === 'external') return;
    let result = true;
    if (target.kind === 'external') result = await vscode.env.openExternal(vscode.Uri.parse(target.uri));
    else await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(target.uri));
    if (testing) linkOpenResults.push({ uri: target.uri, result });
    if (result && target.kind === 'external' && !source.editor.document.isClosed && source.editor.document.version === sourceVersion) {
      clearOpenedHint();
      hintEditor = source.editor;
      const position = source.editor.document.positionAt(source.start);
      source.editor.setDecorations(openedHint, [{ range: new vscode.Range(position, position), renderOptions: {
        after: { contentText: ` ${target.uri.replace(/[\r\n\t]/g, ' ')} opened ` }
      } }]);
      hintTimer = setTimeout(clearOpenedHint, 2000);
    }
  }
  const applied = testing ? new vscode.EventEmitter<vscode.TextEditor>() : undefined;
  if (applied) context.subscriptions.push(applied);
  const states = new WeakMap<vscode.TextEditor, AppliedState>();
  const lastSelections = new WeakMap<vscode.TextEditor, readonly vscode.Selection[]>();
  const selectionDocuments = new WeakMap<vscode.TextEditor, vscode.TextDocument>();
  const linkClicks = new WeakMap<vscode.TextEditor, { selections: readonly vscode.Selection[]; version: number; offset: number; destination: string }>();
  const pendingLinks = new Map<vscode.TextEditor, { selections: readonly vscode.Selection[]; version: number; timer: ReturnType<typeof setTimeout> }>();
  const navigationPins = new Map<vscode.TextEditor, { document: vscode.TextDocument; column: vscode.ViewColumn | undefined; version: number; start: number; end: number; origin: readonly vscode.Selection[]; activation: vscode.Range; gestureUntil: number; focusUntil: number }>();
  const escapePins = new Map<vscode.TextEditor, { document: vscode.TextDocument; version: number; start: number; end: number; selection: vscode.Selection }>();
  context.subscriptions.push({ dispose: () => { escapePins.clear(); void vscode.commands.executeCommand('setContext', 'markdownInCode.canRenderComment', false); } });
  context.subscriptions.push({ dispose: () => { for (const pending of pendingLinks.values()) clearTimeout(pending.timer); pendingLinks.clear(); navigationPins.clear(); } });
  let sequence = 0;
  const options: Record<Exclude<Style, CodeStyle | 'heading' | 'orderedMarker' | 'taskMarker' | 'quoteMarker' | 'link' | 'tableGap' | 'tableHeader' | 'tableRow' | 'tableRowHeader'>, vscode.DecorationRenderOptions> = {
    commentText: { color: new vscode.ThemeColor('editor.foreground'), light: { color: '#4d4d4d' }, dark: { color: '#a0a0a0' } },
    listMarker: { color: 'transparent', before: {
      contentText: '•', color: new vscode.ThemeColor('editor.foreground'),
      fontStyle: 'normal', fontWeight: 'normal', width: '1ch', margin: '0 -1ch 0 0'
    }, light: { before: { color: '#4d4d4d' } }, dark: { before: { color: '#a0a0a0' } } },
    strong: { fontWeight: 'bold' }, emphasis: { fontStyle: 'italic' },
    delete: { textDecoration: 'line-through' },
    inlineCode: { backgroundColor: new vscode.ThemeColor('textCodeBlock.background') },
    marker: { opacity: '0', letterSpacing: '-1em' },
    horizontalRule: { color: 'transparent', before: {
      contentText: '', width: '100vw', height: '0px',
      border: '0.5px solid', borderColor: new vscode.ThemeColor('editorLineNumber.foreground'),
      margin: '0 -100vw 0.3em 0'
    } }
  };
  const types = new Map(Object.entries(options).filter(([style]) => style !== 'listMarker').map(([style, value]) => [style as Style, vscode.window.createTextEditorDecorationType({ ...value, rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed })]));
  context.subscriptions.push(...types.values());
  const headingGroups = new Map<string, vscode.TextEditorDecorationType[]>();
  context.subscriptions.push({ dispose: () => { for (const group of headingGroups.values()) group.forEach(type => type.dispose()); } });
  const codeTypes = Object.fromEntries(Object.entries(CODE_PALETTES).map(([appearance, palette]) => {
    const colors: Record<CodeStyle, vscode.DecorationRenderOptions> = {
      codeBackground: {},
      codeText: { color: palette.foreground, fontStyle: 'normal', fontWeight: 'normal' },
      codeKeyword: { color: palette.keyword }, codeString: { color: palette.string },
      codeNumber: { color: palette.number }, codeComment: { color: palette.comment },
      // Prefer the native input's viewport width where available. Older renderers
      // retain the existing text-layer query container as the explicit fallback.
      codeFence: { color: 'transparent', textDecoration: 'none; position: static; .monaco-editor .view-lines:has(&) { container-type: inline-size; } ' + nativeViewportWidthRules() }
    };
    const entries = CODE_STYLES.map(style => [style, vscode.window.createTextEditorDecorationType({
      ...(style === 'codeBackground' ? {} : { fontStyle: 'normal', fontWeight: 'normal', textDecoration: 'none; position: relative; z-index: 1;' }),
      ...colors[style], rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    })] as const);
    context.subscriptions.push(...entries.map(([, type]) => type));
    return [appearance, new Map(entries)];
  })) as Record<'light' | 'dark', Map<CodeStyle, vscode.TextEditorDecorationType>>;
  const boxHidden = vscode.window.createTextEditorDecorationType({ opacity: '0', rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed });
  const boxFrame = vscode.window.createTextEditorDecorationType({ rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed });
  const boxRule = vscode.window.createTextEditorDecorationType({ rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed });
  context.subscriptions.push(boxHidden, boxFrame, boxRule);
  // Register additional marker types after existing frame/inline types: Monaco
  // orders coincident attachments by decoration identity, affecting the inset.
  // Bullets can share the frame's anchor too, including at column zero. Creating
  // them before the frame places them outside its inset while text stays put.
  const listType = vscode.window.createTextEditorDecorationType({ ...options.listMarker, rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed });
  types.set('listMarker', listType);
  context.subscriptions.push(listType);
  for (const style of ['orderedMarker', 'taskMarker'] as const) {
    const type = vscode.window.createTextEditorDecorationType({ color: 'transparent', rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed });
    types.set(style, type);
    context.subscriptions.push(type);
  }
  const quoteType = vscode.window.createTextEditorDecorationType({ color: 'transparent', before: {
    contentText: '│', color: new vscode.ThemeColor('editorLineNumber.foreground'),
    fontStyle: 'normal', fontWeight: 'normal', width: '1ch', margin: '0 -1ch 0 0'
  } });
  types.set('quoteMarker', quoteType);
  context.subscriptions.push(quoteType);
  const linkType = vscode.window.createTextEditorDecorationType({ color: new vscode.ThemeColor('textLink.foreground'), textDecoration: 'underline', rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed });
  types.set('link', linkType);
  context.subscriptions.push(linkType);
  const tableGapType = vscode.window.createTextEditorDecorationType({ color: 'transparent', textDecoration: 'none; font-size: 0;', rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed });
  const tableHeaderType = vscode.window.createTextEditorDecorationType({ fontWeight: 'bold', rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed });
  types.set('tableGap', tableGapType);
  types.set('tableHeader', tableHeaderType);
  context.subscriptions.push(tableGapType, tableHeaderType);
  for (const style of ['tableRow', 'tableRowHeader'] as const) {
    const type = vscode.window.createTextEditorDecorationType({ color: 'transparent', textDecoration: 'none; font-size: 0;', rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed });
    types.set(style, type); context.subscriptions.push(type);
  }
  const session = new RenderingSession();
  /**
   * ## caretComment(editor) ⇒ {CommentRegion | undefined}
   * Keep Escape eligibility tied to an enabled renderer and one source caret, leaving selection and multicursor cancellation to the editor.
   *
   * **Kind:** function
   * **Access:** private
   *
   * ## Parameters
   * - `editor` **{vscode.TextEditor}** - Editor whose current source selection is being inspected.
   *
   * ## Returns
   * **{CommentRegion | undefined}** - Comment containing the caret, or none for disabled/unsupported/selection states.
   *
   * ## Implementation Details
   * Compiler-derived bounds are shared with rendering; a separate delimiter regex would disagree on strings, incomplete comments and grouped lines.
   */
  function caretComment(editor: vscode.TextEditor) {
    if (!session.isEnabled || !languages.has(editor.document.languageId) || editor.selections.length !== 1 || !editor.selection.isEmpty) return;
    const offset = editor.document.offsetAt(editor.selection.active);
    return extractComments(editor.document.getText(), editor.document.fileName).find(region => offset >= region.start && offset <= region.end);
  }
  /**
   * ## updateEscapeContext() ⇒ {void}
   * Scope the Escape keybinding to a revealed active comment instead of consuming Escape throughout VS Code.
   *
   * **Kind:** function
   * **Access:** private
   *
   * ## Parameters
   * None.
   *
   * ## Returns
   * **{void}** - Requests an updated `markdownInCode.canRenderComment` context key.
   *
   * ## Implementation Details
   * The contributed when-clause additionally excludes editor popups and notifications. Already-protected comments need no second Escape action.
   *
   * ## Agent Notes
   * Same-position clicks may emit no selection event. Render-only Escape is an explicit user choice; do not add polling, cursor parking or a two-way toggle to work around it.
   */
  function updateEscapeContext() {
    const editor = vscode.window.activeTextEditor;
    void vscode.commands.executeCommand('setContext', 'markdownInCode.canRenderComment',
      !!editor && !escapePins.has(editor) && !navigationPins.has(editor) && !!caretComment(editor));
  }
  /**
   * ## update(editor) ⇒ {void}
   * Apply one editor's presentation while preserving source-caret history across passive focus, theme and layout refreshes.
   *
   * **Kind:** function
   * **Access:** private
   *
   * ## Parameters
   * - `editor` **{vscode.TextEditor}** - Exact visible editor instance; another split may show the same document differently.
   *
   * ## Returns
   * **{void}** - Replaces semantic/frame/code decorations and publishes test state when enabled.
   *
   * ## Implementation Details
   * A returning local-file tab may have a new editor wrapper, so navigation state transfers only within its original group/version. Pending clicks render using the previous selection until activation or timeout, preventing a transient raw-source flash.
   *
   * ## Agent Notes
   * Never overwrite pre-click selections from a paint-only callback. Keep prose/token foregrounds disjoint and new marker registration after existing types; inline attachment order affects measured insets. Source coordinates, editor columns and viewport CSS widths are different units.
   */
  function update(editor: vscode.TextEditor) {
    // Rendering can run for theme/focus/options changes before the mouse event
    // reaches us. Those updates must not overwrite the pre-click cursor.
    const document = editor.document;
    const escaped = escapePins.get(editor);
    if (escaped && (escaped.document !== document || escaped.version !== document.version)) escapePins.delete(editor);
    // A returning tab can have a new editor wrapper. Transfer its presentation
    // within the same group only, so another split keeps independent editing.
    if (!navigationPins.has(editor)) {
      for (const [previous, saved] of navigationPins) {
        if (saved.document === document && saved.version === document.version && saved.column === editor.viewColumn &&
            !vscode.window.visibleTextEditors.includes(previous)) {
          navigationPins.delete(previous);
          saved.focusUntil = Date.now() + 200;
          navigationPins.set(editor, saved);
          editor.selections = [...saved.origin];
          break;
        }
      }
    }
    const pin = navigationPins.get(editor);
    if (pin && (pin.document !== document || pin.version !== document.version)) navigationPins.delete(editor);
    if (editor === vscode.window.activeTextEditor) updateEscapeContext();
    if (selectionDocuments.get(editor) !== document) {
      selectionDocuments.set(editor, document);
      lastSelections.set(editor, [...editor.selections]);
      linkClicks.delete(editor);
      const pending = pendingLinks.get(editor);
      if (pending) { clearTimeout(pending.timer); pendingLinks.delete(editor); }
    }
    let headingSizes: number[] = [];
    const key = document.uri.toString();
    const theme = vscode.window.activeColorTheme.kind;
    const codeAppearance = theme === vscode.ColorThemeKind.Light || theme === vscode.ColorThemeKind.HighContrastLight ? 'dark' : 'light';
    // Focus/theme/layout callbacks can run between the mouse selection and
    // native link activation. Honor the same reveal delay in every render path,
    // otherwise such a callback briefly exposes source before activation pins it.
    const pendingSelection = pendingLinks.get(editor);
    const presentationSelections = pendingSelection?.version === document.version
      ? pendingSelection.selections : editor.selections;
    const active = presentationSelections.map(selection => ({ start: document.offsetAt(selection.start), end: document.offsetAt(selection.end) }));
    /**
     * ## report(ranges, boxes) ⇒ {void}
     * Acknowledge completed decoration application so integration tests wait for real editor updates rather than forcing them.
     *
     * **Kind:** function
     * **Access:** private
     *
     * ## Parameters
     * - `ranges` **{AppliedState["ranges"]}** - Visible semantic source ranges for this application.
     * - `boxes` **{AppliedState["boxes"]}** *(optional)* - Frame state; defaults to none.
     *
     * ## Returns
     * **{void}** - Stores an incremented test snapshot and emits onDidApply, or does nothing outside test mode.
     *
     * ## Implementation Details
     * The signal is emitted after decoration calls. A reported range is still not proof of painted pixels, native input routing or external-app focus.
     */
    function report(ranges: AppliedState['ranges'], boxes: AppliedState['boxes'] = []) {
      if (!applied) return;
      states.set(editor, { sequence: ++sequence, version: document.version, languageId: document.languageId, codeAppearance, headingSizes, selections: active, ranges, boxes });
      applied.fire(editor);
    }
    if (!languages.has(document.languageId)) {
      navigationPins.delete(editor);
      escapePins.delete(editor);
      session.close(key);
      for (const type of types.values()) editor.setDecorations(type, []);
      for (const group of headingGroups.values()) for (const type of group) editor.setDecorations(type, []);
      for (const palette of Object.values(codeTypes)) for (const type of palette.values()) editor.setDecorations(type, []);
      editor.setDecorations(boxHidden, []);
      editor.setDecorations(boxFrame, []);
      editor.setDecorations(boxRule, []);
      report([]);
      return;
    }
    // Selecting/clicking a comment reveals its complete source for editing.
    const { decorations: markdown, boxes } = session.presentation(key, document.version, document.fileName, () => document.getText(), active, Number(editor.options.tabSize) || 4, escapePins.get(editor) ?? navigationPins.get(editor));
    const visible = [...markdown, ...commentText(boxes, markdown)];
    for (const [style, type] of types) {
      const ranges = visible.filter(decoration => decoration.style === style).map(decoration => {
        const range = new vscode.Range(document.positionAt(decoration.start), document.positionAt(decoration.end));
        if (style === 'tableRow' || style === 'tableRowHeader') return { range, renderOptions: { before: {
          contentText: decoration.label, color: new vscode.ThemeColor('editor.foreground'),
          fontStyle: 'normal', fontWeight: style === 'tableRowHeader' ? 'bold' : 'normal',
          // Measured inline width lets Monaco expose a horizontal scrollbar even
          // with word wrap on; absolute positioning only painted clipped overflow.
          width: `${decoration.label?.length ?? 0}ch`,
          textDecoration: 'none; font-size: var(--vscode-editor-font-size); letter-spacing: normal; white-space: pre; pointer-events: none;'
        } } };
        if (style === 'tableGap') return { range, renderOptions: { before: {
          contentText: decoration.label, color: new vscode.ThemeColor('editor.foreground'),
          fontStyle: 'normal', fontWeight: 'normal',
          textDecoration: 'none; font-size: var(--vscode-editor-font-size); letter-spacing: normal; white-space: pre;'
        } } };
        if (style === 'link') return { range, hoverMessage: new vscode.MarkdownString().appendText(`${decoration.title ? decoration.title + '\n' : ''}${decoration.destination}\nMarkdown in Code: Open Link at Cursor`) };
        return (style === 'orderedMarker' || style === 'taskMarker') ? { range, renderOptions: { before: {
          contentText: decoration.label, color: new vscode.ThemeColor('editor.foreground'),
          fontStyle: 'normal', fontWeight: 'normal', width: `${decoration.end - decoration.start}ch`, margin: `0 -${decoration.end - decoration.start}ch 0 0`
        } } } : range;
      });
      if (style === 'orderedMarker' || style === 'taskMarker' || style === 'link' || style === 'tableGap' || style === 'tableRow' || style === 'tableRowHeader') editor.setDecorations(type, ranges as vscode.DecorationOptions[]);
      else editor.setDecorations(type, ranges as vscode.Range[]);
    }
    const config = vscode.workspace.getConfiguration('editor', document);
    const fontSize = config.get<number>('fontSize', 14);
    const configuredHeight = config.get<number>('lineHeight', 0);
    const allowance = vscode.workspace.getConfiguration('markdownInCode', document).get<number>('fontFitAllowance', 1.208421);
    const { lineHeight, levels } = headingLayout(fontSize, configuredHeight, process.platform, allowance);
    headingSizes = levels.map(value => value.fontSize);
    const nextHeadingKey = JSON.stringify(levels);
    let headingTypes = headingGroups.get(nextHeadingKey);
    if (!headingTypes) {
      headingTypes = levels.map(level => vscode.window.createTextEditorDecorationType({
        fontWeight: level.fontWeight, fontStyle: level.fontStyle,
        light: { color: level.lightColor }, dark: { color: level.darkColor },
        textDecoration: `underline; font-size: ${level.relativeSize};`,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
      }));
      headingGroups.set(nextHeadingKey, headingTypes);
    }
    for (const group of headingGroups.values()) for (const type of group) editor.setDecorations(type, []);
    headingTypes.forEach((type, index) => editor.setDecorations(type, visible.filter(value => value.style === 'heading' && value.level === index + 1).map(value => new vscode.Range(document.positionAt(value.start), document.positionAt(value.end)))));
    /**
     * ## frameColumn(decoration) ⇒ {number}
     * Reuse the frame's measured inset for fenced bands rather than guessing from comment-prefix character counts.
     *
     * **Kind:** function
     * **Access:** private
     *
     * ## Parameters
     * - `decoration` **{Decoration}** - Visible source decoration whose row needs a frame origin.
     *
     * ## Returns
     * **{number}** - Source anchor column plus frame compensation, or zero without a matching frame row.
     *
     * ## Implementation Details
     * Tabs, stripped prefixes and zero-width anchors can make source character positions differ from displayed columns.
     */
    const frameColumn = (decoration: typeof visible[number]) => {
      const box = boxes.find(box => box.region === decoration.region && document.positionAt(box.anchor).line === document.positionAt(decoration.start).line);
      return box ? document.positionAt(box.anchor).character + box.marginColumns : 0;
    };
    /**
     * ## quoteInset(decoration) ⇒ {number}
     * Keep explicit quote bars outside the opposite-theme code band.
     *
     * **Kind:** function
     * **Access:** private
     *
     * ## Parameters
     * - `decoration` **{Decoration}** - Fence/code decoration whose row is being laid out.
     *
     * ## Returns
     * **{number}** - Additional source-column inset between quote markers and the row's code background, or zero.
     *
     * ## Implementation Details
     * A quoted fence uses normalized text for parsing but must still leave its source quote prefix visible in the surrounding theme.
     */
    const quoteInset = (decoration: typeof visible[number]) => {
      const line = document.positionAt(decoration.start).line;
      const quotes = visible.filter(value => value.style === 'quoteMarker' && document.positionAt(value.start).line === line);
      const background = visible.find(value => value.style === 'codeBackground' && document.positionAt(value.start).line === line);
      return quotes.length && background ? document.positionAt(background.start).character - Math.min(...quotes.map(value => document.positionAt(value.start).character)) : 0;
    };
    for (const [appearance, palette] of Object.entries(codeTypes)) {
      for (const [style, type] of palette) {
        const codeRanges: vscode.DecorationOptions[] = appearance === codeAppearance ? visible.filter(decoration => decoration.style === style).map(decoration => ({
          range: new vscode.Range(document.positionAt(decoration.start), document.positionAt(decoration.end)),
          ...(style === 'codeFence' ? { renderOptions: {
            before: decoration.label ? {
              contentText: ` ${decoration.label} `,
              color: CODE_PALETTES[codeAppearance].foreground,
              backgroundColor: CODE_PALETTES[codeAppearance].background,
              // Native input width already excludes the scrollbar. Deduct it
              // only in the legacy text-layer fallback, as before.
              textDecoration: `none; position: fixed; left: calc(var(--mic-native-viewport-width, calc(100cqw - ${config.get<number>('scrollbar.verticalScrollbarSize', 14)}px)) / 2 + ${(frameColumn(decoration) + 1 + quoteInset(decoration)) / 2}ch); transform: translateX(-50%); z-index: 2;`
            } : undefined,
            after: {
              contentText: '', color: CODE_PALETTES[codeAppearance].foreground,
              textDecoration: `none; position: fixed; left: ${frameColumn(decoration) + 2 + quoteInset(decoration)}ch; right: 0; margin-top: 0.7em; border-top: 1px solid; z-index: 1;`
            }
          } } : style === 'codeBackground' ? { renderOptions: { before: {
            contentText: '', backgroundColor: CODE_PALETTES[codeAppearance].background,
            width: '100vw', height: `${lineHeight}px`,
            // Start at the frame's inset, independently of prefixes or empty spans.
            textDecoration: `none; position: fixed; left: ${frameColumn(decoration) + 1 + quoteInset(decoration)}ch; z-index: 0;`
          } } } : {})
        })) : [];
        editor.setDecorations(type, codeRanges);
      }
    }
    editor.setDecorations(boxHidden, boxes.flatMap(box => box.hidden.map(span => new vscode.Range(document.positionAt(span.start), document.positionAt(span.end)))));
    editor.setDecorations(boxFrame, boxes.map(box => ({
      range: new vscode.Range(document.positionAt(box.anchor), document.positionAt(box.anchor)),
      renderOptions: { before: {
        contentText: box.text,
        color: new vscode.ThemeColor('editorLineNumber.foreground'),
        fontStyle: 'normal', fontWeight: 'normal',
        width: `${box.text.length}ch`, margin: `0 0 0 ${box.marginColumns}ch`
      } }
    })));
    // An oversized zero-height attachment is clipped by each editor viewport. Its
    // negative margin cancels layout width, so it doesn't create horizontal scrolling.
    editor.setDecorations(boxRule, boxes.flatMap(box => box.ruleAnchor === undefined ? [] : [{
      range: new vscode.Range(document.positionAt(box.ruleAnchor), document.positionAt(box.ruleAnchor)),
      renderOptions: { after: { contentText: '', width: '100vw', height: '0px',
        border: '0.5px solid', borderColor: new vscode.ThemeColor('editorLineNumber.foreground'),
        margin: '0 -100vw 0.3em 0' } }
    }]));
    report(visible.map(({ style, start, end, level }) => ({ style, start, end, ...(level === undefined ? {} : { level }) })), boxes.map(({ anchor, text, marginColumns, ruleAnchor, hidden }) => ({ anchor, text, marginColumns, ruleAnchor, hidden })));
  }
  /**
   * ## updateVisible() ⇒ {void}
   * Refresh each visible view separately so theme/toggle changes do not collapse split-editor selection policy into document state.
   *
   * **Kind:** function
   * **Access:** private
   *
   * ## Parameters
   * None.
   *
   * ## Returns
   * **{void}** - Calls the presentation adapter for all currently visible editors.
   *
   * ## Implementation Details
   * A URI can appear in multiple groups; updating only the active editor would leave stale decorations elsewhere.
   */
  function updateVisible() { for (const editor of vscode.window.visibleTextEditors) update(editor); }
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider([...languages].map(language => ({ language })), {
      /**
       * ## provideDocumentLinks(document) ⇒ {vscode.DocumentLink[]}
       * Route supported Markdown links through our native-activation command instead of allowing hidden destinations to take a competing opener path.
       *
       * **Kind:** method
       * **Access:** private
       *
       * ## Parameters
       * - `document` **{vscode.TextDocument}** - Source model requested by VS Code's link service.
       *
       * ## Returns
       * **{vscode.DocumentLink[]}** - Deduplicated full-syntax hit ranges with command URI targets and destination tooltips.
       *
       * ## Implementation Details
       * Multiline labels can produce multiple visible spans sharing one activation range. Uri.from preserves the encoded argument query until the command opener decodes it.
       *
       * ## Agent Notes
       * Do not replace Uri.from with Uri.parse here: premature query decoding broke Windows drive-colon arguments. Providing links must remain side-effect free.
       */
      provideDocumentLinks(document) {
        const seen = new Set<string>();
        return parseComments(document.getText(), document.fileName).flatMap(value => {
          if (value.style !== 'link' || !value.destination) return [];
          const target = resolveLink(value.destination, document.uri.toString());
          if (!target) return [];
          // Native link navigation first moves the caret. Route activation through
          // our command to restore the pre-click selection before opening.
          // Keep the query encoded until VS Code's command opener decodes it.
          // Uri.parse decodes it early, corrupting encoded drive colons/targets.
          const command = vscode.Uri.from({ scheme: 'command', path: 'markdownInCode.followLink', query: encodeURIComponent(JSON.stringify([document.uri.toString(), value.destination, value.activation ?? { start: value.start, end: value.end }])) });
          // Cover hidden destination syntax too. Otherwise the built-in URL
          // provider can win at some positions and bypass cursor restoration.
          const span = value.activation ?? value;
          const key = `${span.start}:${span.end}:${value.destination}`;
          if (seen.has(key)) return [];
          seen.add(key);
          // Monaco can hit the preceding source column at the first visible
          // glyph after collapsed syntax. Include one neighbouring column,
          // without crossing a source-line boundary.
          const link = new vscode.DocumentLink(linkHitRange(document, span), command);
          link.tooltip = value.title ? `${value.title}: ${value.destination}` : value.destination;
          return [link];
        });
      }
    }),
    /**
     * ## followLink(documentUri, destination, activation) ⇒ {Promise<void>}
     * Preserve rendered presentation during native activation despite the caret movement that VS Code reports before opening a link.
     *
     * **Kind:** async command handler
     * **Access:** private
     *
     * ## Parameters
     * - `documentUri` **{string}** - Command-encoded source URI, canonicalized before matching a visible editor.
     * - `destination` **{string}** - Target text to resolve from that document.
     * - `activation` **{Span | undefined}** - Exact source link identity when supplied by the provider.
     *
     * ## Returns
     * **{Promise<void>}** - Completes explicit target opening, or returns without action for invalid/stale input.
     *
     * ## Implementation Details
     * Click history survives the 200 ms ordinary-click reveal timeout so late command dispatch can recover the original selection. Region/version protection also survives passive external focus changes and local tab return.
     *
     * ## Agent Notes
     * Keep delayed activation, exact-once native opening and start/middle/end hit tests. Timer-only fixes did not reliably preserve rendering.
     */
    vscode.commands.registerCommand('markdownInCode.followLink', async (documentUri: string, destination: string, activation?: { start: number; end: number }) => {
      if (typeof documentUri !== 'string') return;
      const sourceUri = vscode.Uri.parse(documentUri).toString();
      const editor = vscode.window.visibleTextEditors.find(value => value.document.uri.toString() === sourceUri);
      if (!editor || typeof destination !== 'string' || !languages.has(editor.document.languageId)) return;
      const pending = pendingLinks.get(editor);
      const click = linkClicks.get(editor);
      const offset = click?.offset ?? editor.document.offsetAt(editor.selection.active);
      const links = parseComments(editor.document.getText(), editor.document.fileName).filter(value => value.style === 'link' && value.destination === destination);
      const link = (activation && links.find(value => value.activation?.start === activation.start && value.activation.end === activation.end)) ||
        links.find(value => value.activation && linkHitRange(editor.document, value.activation).contains(editor.document.positionAt(offset))) || links[0];
      if (!link) return;
      const origin = click?.version === editor.document.version ? click.selections : lastSelections.get(editor) ?? [...editor.selections];
      navigationPins.set(editor, { document: editor.document, column: editor.viewColumn, version: editor.document.version, start: link.region.start, end: link.region.end,
        origin, activation: linkHitRange(editor.document, link.activation ?? link), gestureUntil: Date.now() + 200, focusUntil: 0 });
      linkClicks.delete(editor);
      if (pending) {
        clearTimeout(pending.timer); pendingLinks.delete(editor);
      }
      if (click && click.version === editor.document.version && click.destination === destination && editor.document.offsetAt(editor.selection.active) === click.offset) editor.selections = [...click.selections];
      lastSelections.set(editor, [...editor.selections]);
      update(editor);
      const target = resolveLink(destination, documentUri);
      if (!target) return;
      await openTarget(target, { editor, start: link.start });
    }),
    /**
     * ## openLink() ⇒ {Promise<void>}
     * Offer keyboard/palette activation without requiring a modifier click or changing the ordinary source-editing policy.
     *
     * **Kind:** async command handler
     * **Access:** private
     *
     * ## Parameters
     * None.
     *
     * ## Returns
     * **{Promise<void>}** - Opens the supported link under the active caret, or explains why no target can be opened.
     *
     * ## Implementation Details
     * This explicit command intentionally does not install native-click presentation protection; source editing and navigation are separate user intents.
     */
    vscode.commands.registerCommand('markdownInCode.openLink', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !languages.has(editor.document.languageId)) return;
      const offset = editor.document.offsetAt(editor.selection.active);
      const link = parseComments(editor.document.getText(), editor.document.fileName).find(value => value.style === 'link' && value.activation && offset >= value.activation.start && offset < value.activation.end);
      if (!link?.destination) { await vscode.window.showInformationMessage('Place the cursor inside a Markdown link in a comment.'); return; }
      const target = resolveLink(link.destination, editor.document.uri.toString());
      if (!target) { await vscode.window.showInformationMessage('This link target cannot be opened by Markdown in Code.'); return; }
      await openTarget(target, { editor, start: link.start });
    }),
    /**
     * ## renderComment() ⇒ {void}
     * Restore formatting at the current source caret without moving it beyond a long comment or scrolling to its end.
     *
     * **Kind:** command handler
     * **Access:** private
     *
     * ## Parameters
     * None.
     *
     * ## Returns
     * **{void}** - Protects the eligible current comment and repaints; disabled/multiple/nonempty selections are no-ops.
     *
     * ## Implementation Details
     * Canceling a pending link reveal prevents its later timer from undoing Escape. Escape uses its own pin because it has no external-navigation gesture or cursor-restoration requirement.
     *
     * ## Agent Notes
     * Do not implement the old cursor-after-comment strategy. An unchanged second click can be unobservable; this documented limitation is accepted rather than patched with a timing race.
     */
    vscode.commands.registerCommand('markdownInCode.renderComment', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const region = caretComment(editor);
      if (!region) return;
      const pending = pendingLinks.get(editor);
      if (pending) { clearTimeout(pending.timer); pendingLinks.delete(editor); }
      linkClicks.delete(editor);
      navigationPins.delete(editor);
      escapePins.set(editor, { document: editor.document, version: editor.document.version, start: region.start, end: region.end, selection: editor.selection });
      lastSelections.set(editor, [...editor.selections]);
      update(editor);
    }),
    /**
     * ## toggleRendering() ⇒ {void}
     * Make the global rendering switch authoritative over all temporary interaction exceptions.
     *
     * **Kind:** command handler
     * **Access:** private
     *
     * ## Parameters
     * None.
     *
     * ## Returns
     * **{void}** - Clears Escape/navigation protection, flips session policy and refreshes visible views.
     *
     * ## Implementation Details
     * Retaining pins across a toggle would make comments unexpectedly stay rendered when the user returns to source editing.
     */
    vscode.commands.registerCommand('markdownInCode.toggle', () => { escapePins.clear(); navigationPins.clear(); session.toggle(); updateVisible(); }),
    vscode.window.onDidChangeActiveTextEditor(updateEscapeContext),
    /**
     * ## onWindowStateChanged(state) ⇒ {void}
     * Keep a native link's comment rendered when browser/mail focus changes cause passive editor callbacks.
     *
     * **Kind:** event handler
     * **Access:** private
     *
     * ## Parameters
     * - `state` **{vscode.WindowState}** - Current application focus state.
     *
     * ## Returns
     * **{void}** - Refreshes navigation-protected editors and opens a brief focus-return grace period.
     *
     * ## Implementation Details
     * The 200 ms grace is for late command-selection callbacks, not a general delay before every editor update.
     *
     * ## Agent Notes
     * Destination-capture tests do not exercise real OS focus. Use the opt-in external-browser suite when changing this path.
     */
    vscode.window.onDidChangeWindowState(state => {
      for (const [editor, pin] of navigationPins) {
        if (state.focused) pin.focusUntil = Date.now() + 200;
        update(editor);
      }
    }),
    /**
     * ## onVisibleEditorsChanged(editors) ⇒ {void}
     * Release hidden Escape state while allowing native local-link navigation to recover its source tab later.
     *
     * **Kind:** event handler
     * **Access:** private
     *
     * ## Parameters
     * - `editors` **{readonly vscode.TextEditor[]}** - New visible editor set.
     *
     * ## Returns
     * **{void}** - Clears hidden Escape pins, refreshes visible presentations and updates shortcut eligibility.
     *
     * ## Implementation Details
     * Escape applies to the current view; navigation has an intentional tab-return lifetime. Treating both lifetimes identically reintroduces local-file return defects.
     */
    vscode.window.onDidChangeVisibleTextEditors(editors => {
      for (const editor of escapePins.keys()) if (!editors.includes(editor)) escapePins.delete(editor);
      updateVisible(); updateEscapeContext();
    }),
    /**
     * ## onSelectionChanged(event) ⇒ {void}
     * Distinguish deliberate editing from passive navigation callbacks without guessing modifier keys the public API does not provide.
     *
     * **Kind:** event handler
     * **Access:** private
     *
     * ## Parameters
     * - `event` **{vscode.TextEditorSelectionChangeEvent}** - Editor, selections and optional mouse/keyboard/command cause.
     *
     * ## Returns
     * **{void}** - Releases or preserves protection, records click origin, and applies or defers source reveal.
     *
     * ## Implementation Details
     * Ordinary link clicks wait briefly for native activation; other movement reveals immediately. Passive restores must not replace the pre-click origin. Escape releases on real movement or reported mouse/keyboard selection activity.
     *
     * ## Agent Notes
     * No selection event is guaranteed for an identical-position click. Never infer click occurrence from hover, layout callbacks or elapsed time.
     */
    vscode.window.onDidChangeTextEditorSelection(event => {
      const editor = event.textEditor;
      const escaped = escapePins.get(editor);
      if (escaped) {
        if (escaped.document === editor.document && escaped.version === editor.document.version && editor.selections.length === 1 &&
            editor.selection.isEqual(escaped.selection) && event.kind !== vscode.TextEditorSelectionChangeKind.Mouse && event.kind !== vscode.TextEditorSelectionChangeKind.Keyboard) {
          update(editor); return;
        }
        escapePins.delete(editor);
      }
      const pin = navigationPins.get(editor);
      if (pin && pin.document === editor.document && pin.version === editor.document.version) {
        const atOrigin = editor.selections.length === pin.origin.length && editor.selections.every((value, index) => value.isEqual(pin.origin[index]));
        const ownRestore = event.kind === vscode.TextEditorSelectionChangeKind.Command && atOrigin;
        const passive = event.kind === undefined || !vscode.window.state.focused || ownRestore ||
          (event.kind === vscode.TextEditorSelectionChangeKind.Command && Date.now() < pin.focusUntil) ||
          (event.kind === vscode.TextEditorSelectionChangeKind.Mouse && Date.now() < pin.gestureUntil && pin.activation.contains(editor.selection.active));
        if (passive && editor.selection.isEmpty) {
          if (!atOrigin) editor.selections = [...pin.origin];
          lastSelections.set(editor, [...pin.origin]);
          update(editor); return;
        }
        navigationPins.delete(editor);
      }
      const previous = pendingLinks.get(editor);
      if (previous) { clearTimeout(previous.timer); pendingLinks.delete(editor); }
      const offset = editor.document.offsetAt(editor.selection.active);
      const clickedLink = event.kind === vscode.TextEditorSelectionChangeKind.Mouse && editor.selection.isEmpty && languages.has(editor.document.languageId)
        ? parseComments(editor.document.getText(), editor.document.fileName).find(value => value.style === 'link' && value.activation && linkHitRange(editor.document, value.activation).contains(editor.selection.active)) : undefined;
      if (clickedLink?.destination) {
        const selections = previous?.selections ?? lastSelections.get(editor) ?? [...editor.selections];
        linkClicks.set(editor, { selections, version: editor.document.version, offset, destination: clickedLink.destination });
        // The public selection event does not expose modifier keys. Allow native
        // link activation to cancel reveal; ordinary clicks reveal shortly after.
        const timer = setTimeout(() => { pendingLinks.delete(editor); lastSelections.set(editor, [...editor.selections]); update(editor); }, 200);
        pendingLinks.set(editor, { selections, version: editor.document.version, timer });
      } else {
        const click = linkClicks.get(editor);
        if (event.kind === vscode.TextEditorSelectionChangeKind.Keyboard || !editor.selection.isEmpty || (click && offset !== click.offset)) linkClicks.delete(editor);
        lastSelections.set(editor, [...editor.selections]);
        update(editor);
      }
    }),
    vscode.window.onDidChangeTextEditorOptions(event => update(event.textEditor)),
    vscode.window.onDidChangeActiveColorTheme(updateVisible),
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('editor.fontSize') || event.affectsConfiguration('editor.lineHeight') || event.affectsConfiguration('editor.wordWrap') || event.affectsConfiguration('markdownInCode.fontFitAllowance')) updateVisible(); }),
    vscode.workspace.onDidOpenTextDocument(updateVisible),
    /**
     * ## onDocumentChanged(event) ⇒ {void}
     * Invalidate interaction offsets before rendering edited text so old version-bound protection cannot hide a user's edit.
     *
     * **Kind:** event handler
     * **Access:** private
     *
     * ## Parameters
     * - `event` **{vscode.TextDocumentChangeEvent}** - Changed document and its current version.
     *
     * ## Returns
     * **{void}** - Clears matching pins/hints and updates visible views of that document.
     *
     * ## Implementation Details
     * A hidden editor may still hold navigation state, so cleanup must inspect pin ownership rather than only the active view.
     */
    vscode.workspace.onDidChangeTextDocument(event => {
      for (const [editor, pin] of escapePins) if (pin.document === event.document) escapePins.delete(editor);
      if (hintEditor?.document === event.document) clearOpenedHint();
      for (const [editor, pin] of navigationPins) if (pin.document === event.document) navigationPins.delete(editor);
      for (const editor of vscode.window.visibleTextEditors) if (editor.document === event.document) update(editor);
    }),
    /**
     * ## onDocumentClosed(document) ⇒ {void}
     * Dispose retained parse source and pending interaction state when the document itself closes.
     *
     * **Kind:** event handler
     * **Access:** private
     *
     * ## Parameters
     * - `document` **{vscode.TextDocument}** - Disposed source model.
     *
     * ## Returns
     * **{void}** - Clears its presentation cache, pins and outstanding reveal timers.
     *
     * ## Implementation Details
     * Tab hiding is not document disposal. Keeping those events distinct is necessary for both split editing and local-link return.
     */
    vscode.workspace.onDidCloseTextDocument(document => {
      for (const [editor, pin] of escapePins) if (pin.document === document) escapePins.delete(editor);
      session.close(document.uri.toString());
      for (const [editor, pin] of navigationPins) if (pin.document === document) navigationPins.delete(editor);
      for (const [editor, pending] of pendingLinks) if (editor.document === document) { clearTimeout(pending.timer); pendingLinks.delete(editor); }
    })
  );
  updateVisible();
  if (applied) {
    return { get openedLinks() { return [...openedLinks]; }, get linkOpenResults() { return linkOpenResults.map(value => ({ ...value })); }, snapshot: (editor: vscode.TextEditor) => {
      const state = states.get(editor);
      return state ? { ...state, headingSizes: [...state.headingSizes], selections: state.selections.map(value => ({ ...value })), ranges: state.ranges.map(value => ({ ...value })), boxes: state.boxes.map(box => ({ ...box, hidden: box.hidden.map(value => ({ ...value })) })) } : undefined;
    }, onDidApply: applied.event } satisfies TestApi;
  }
}
