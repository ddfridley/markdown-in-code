import * as vscode from 'vscode';
import type { Style } from './markdown';
import { RenderingSession } from './rendering';
import type { AppliedState, TestApi } from './test-api';
import { CODE_PALETTES, CODE_STYLES, type CodeStyle } from './fenced-code';
import { headingLayout } from './headings';
import { commentText } from './comment-text';

const languages = new Set(['javascript', 'typescript', 'javascriptreact', 'typescriptreact']);

export function activate(context: vscode.ExtensionContext) {
  const testing = context.extensionMode === vscode.ExtensionMode.Test;
  const applied = testing ? new vscode.EventEmitter<vscode.TextEditor>() : undefined;
  if (applied) context.subscriptions.push(applied);
  const states = new WeakMap<vscode.TextEditor, AppliedState>();
  let sequence = 0;
  const options: Record<Exclude<Style, CodeStyle | 'heading'>, vscode.DecorationRenderOptions> = {
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
  const session = new RenderingSession();
  function update(editor: vscode.TextEditor) {
    let headingSizes: number[] = [];
    const document = editor.document;
    const key = document.uri.toString();
    const theme = vscode.window.activeColorTheme.kind;
    const codeAppearance = theme === vscode.ColorThemeKind.Light || theme === vscode.ColorThemeKind.HighContrastLight ? 'dark' : 'light';
    const active = editor.selections.map(selection => ({ start: document.offsetAt(selection.start), end: document.offsetAt(selection.end) }));
    function report(ranges: AppliedState['ranges'], boxes: AppliedState['boxes'] = []) {
      if (!applied) return;
      states.set(editor, { sequence: ++sequence, version: document.version, languageId: document.languageId, codeAppearance, headingSizes, selections: active, ranges, boxes });
      applied.fire(editor);
    }
    if (!languages.has(document.languageId)) {
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
    const { decorations: markdown, boxes } = session.presentation(key, document.version, document.fileName, () => document.getText(), active, Number(editor.options.tabSize) || 4);
    const visible = [...markdown, ...commentText(boxes, markdown)];
    for (const [style, type] of types) {
      const ranges = visible.filter(decoration => decoration.style === style).map(decoration => new vscode.Range(document.positionAt(decoration.start), document.positionAt(decoration.end)));
      editor.setDecorations(type, ranges);
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
    for (const [appearance, palette] of Object.entries(codeTypes)) {
      for (const [style, type] of palette) {
        const codeRanges: vscode.DecorationOptions[] = appearance === codeAppearance ? visible.filter(decoration => decoration.style === style).map(decoration => ({
          range: new vscode.Range(document.positionAt(decoration.start), document.positionAt(decoration.end)),
          ...(style === 'codeFence' ? { renderOptions: {
            before: decoration.label ? {
              contentText: ` ${decoration.label} `,
              color: CODE_PALETTES[codeAppearance].foreground,
              backgroundColor: CODE_PALETTES[codeAppearance].background,
              textDecoration: `none; position: fixed; left: calc(50cqw + ${(frameColumn(decoration) + 1) / 2}ch - ${config.get<number>('scrollbar.verticalScrollbarSize', 14) / 2}px); transform: translateX(-50%); z-index: 2;`
            } : undefined,
            after: {
              contentText: '', color: CODE_PALETTES[codeAppearance].foreground,
              textDecoration: `none; position: fixed; left: ${frameColumn(decoration) + 2}ch; right: 0; margin-top: 0.7em; border-top: 1px solid; z-index: 1;`
            }
          } } : style === 'codeBackground' ? { renderOptions: { before: {
            contentText: '', backgroundColor: CODE_PALETTES[codeAppearance].background,
            width: '100vw', height: `${lineHeight}px`,
            // Start at the frame's inset, independently of prefixes or empty spans.
            textDecoration: `none; position: fixed; left: ${frameColumn(decoration) + 1}ch; z-index: 0;`
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
    vscode.commands.registerCommand('markdownInCode.toggle', () => { session.toggle(); updateVisible(); }),
    vscode.window.onDidChangeVisibleTextEditors(updateVisible),
    vscode.window.onDidChangeTextEditorSelection(event => update(event.textEditor)),
    vscode.window.onDidChangeTextEditorOptions(event => update(event.textEditor)),
    vscode.window.onDidChangeActiveColorTheme(updateVisible),
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('editor.fontSize') || event.affectsConfiguration('editor.lineHeight') || event.affectsConfiguration('editor.wordWrap')) updateVisible(); }),
    vscode.workspace.onDidOpenTextDocument(updateVisible),
    vscode.workspace.onDidChangeTextDocument(event => { for (const editor of vscode.window.visibleTextEditors) if (editor.document === event.document) update(editor); }),
    vscode.workspace.onDidCloseTextDocument(document => session.close(document.uri.toString()))
  );
  updateVisible();
  if (applied) {
    return { snapshot: (editor: vscode.TextEditor) => {
      const state = states.get(editor);
      return state ? { ...state, headingSizes: [...state.headingSizes], selections: state.selections.map(value => ({ ...value })), ranges: state.ranges.map(value => ({ ...value })), boxes: state.boxes.map(box => ({ ...box, hidden: box.hidden.map(value => ({ ...value })) })) } : undefined;
    }, onDidApply: applied.event } satisfies TestApi;
  }
}
