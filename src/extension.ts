import * as vscode from 'vscode';
import type { Style } from './markdown';
import { RenderingSession } from './rendering';
import type { AppliedState, TestApi } from './test-api';
import { CODE_PALETTES, CODE_STYLES, type CodeStyle } from './fenced-code';
import { headingLayout } from './headings';
import { commentText } from './comment-text';
import { parseComments } from './markdown';
import { resolveLink } from './links';
import { extractComments } from './comments';

const languages = new Set(['javascript', 'typescript', 'javascriptreact', 'typescriptreact']);
function linkHitRange(document: vscode.TextDocument, span: { start: number; end: number }): vscode.Range {
  const start = document.positionAt(span.start);
  const end = document.positionAt(span.end);
  return new vscode.Range(start.character ? start.translate(0, -1) : start,
    end.character < document.lineAt(end.line).text.length ? end.translate(0, 1) : end);
}

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
  function clearOpenedHint() {
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = undefined;
    hintEditor?.setDecorations(openedHint, []);
    hintEditor = undefined;
  }
  context.subscriptions.push(openedHint, { dispose: clearOpenedHint });
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
  const types = new Map(Object.entries(options).map(([style, value]) => [style as Style, vscode.window.createTextEditorDecorationType({ ...value, rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed })]));
  context.subscriptions.push(...types.values());
  const headingGroups = new Map<string, vscode.TextEditorDecorationType[]>();
  context.subscriptions.push({ dispose: () => { for (const group of headingGroups.values()) group.forEach(type => type.dispose()); } });
  const codeTypes = Object.fromEntries(Object.entries(CODE_PALETTES).map(([appearance, palette]) => {
    const colors: Record<CodeStyle, vscode.DecorationRenderOptions> = {
      codeBackground: {},
      codeText: { color: palette.foreground, fontStyle: 'normal', fontWeight: 'normal' },
      codeKeyword: { color: palette.keyword }, codeString: { color: palette.string },
      codeNumber: { color: palette.number }, codeComment: { color: palette.comment },
      // The view-lines width excludes the minimap; its scrollable parent does not.
      // Scope the query container to editors displaying these fence decorations.
      codeFence: { color: 'transparent', textDecoration: 'none; position: static; .monaco-editor .view-lines:has(&) { container-type: inline-size; }' }
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
  function caretComment(editor: vscode.TextEditor) {
    if (!session.isEnabled || !languages.has(editor.document.languageId) || editor.selections.length !== 1 || !editor.selection.isEmpty) return;
    const offset = editor.document.offsetAt(editor.selection.active);
    return extractComments(editor.document.getText(), editor.document.fileName).find(region => offset >= region.start && offset <= region.end);
  }
  function updateEscapeContext() {
    const editor = vscode.window.activeTextEditor;
    void vscode.commands.executeCommand('setContext', 'markdownInCode.canRenderComment',
      !!editor && !escapePins.has(editor) && !navigationPins.has(editor) && !!caretComment(editor));
  }
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
    const { lineHeight, levels } = headingLayout(fontSize, configuredHeight, process.platform);
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
    const frameColumn = (decoration: typeof visible[number]) => {
      const box = boxes.find(box => box.region === decoration.region && document.positionAt(box.anchor).line === document.positionAt(decoration.start).line);
      return box ? document.positionAt(box.anchor).character + box.marginColumns : 0;
    };
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
              textDecoration: `none; position: fixed; left: calc(50cqw + ${(frameColumn(decoration) + 1 + quoteInset(decoration)) / 2}ch - ${config.get<number>('scrollbar.verticalScrollbarSize', 14) / 2}px); transform: translateX(-50%); z-index: 2;`
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
  function updateVisible() { for (const editor of vscode.window.visibleTextEditors) update(editor); }
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider([...languages].map(language => ({ language })), {
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
    vscode.commands.registerCommand('markdownInCode.toggle', () => { escapePins.clear(); navigationPins.clear(); session.toggle(); updateVisible(); }),
    vscode.window.onDidChangeActiveTextEditor(updateEscapeContext),
    vscode.window.onDidChangeWindowState(state => {
      for (const [editor, pin] of navigationPins) {
        if (state.focused) pin.focusUntil = Date.now() + 200;
        update(editor);
      }
    }),
    vscode.window.onDidChangeVisibleTextEditors(editors => {
      for (const editor of escapePins.keys()) if (!editors.includes(editor)) escapePins.delete(editor);
      updateVisible(); updateEscapeContext();
    }),
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
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('editor.fontSize') || event.affectsConfiguration('editor.lineHeight') || event.affectsConfiguration('editor.wordWrap')) updateVisible(); }),
    vscode.workspace.onDidOpenTextDocument(updateVisible),
    vscode.workspace.onDidChangeTextDocument(event => {
      for (const [editor, pin] of escapePins) if (pin.document === event.document) escapePins.delete(editor);
      if (hintEditor?.document === event.document) clearOpenedHint();
      for (const [editor, pin] of navigationPins) if (pin.document === event.document) navigationPins.delete(editor);
      for (const editor of vscode.window.visibleTextEditors) if (editor.document === event.document) update(editor);
    }),
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
