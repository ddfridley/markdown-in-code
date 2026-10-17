import * as vscode from 'vscode';
import type { Style } from './markdown';
import { RenderingSession } from './rendering';
import type { AppliedState, TestApi } from './test-api';

const languages = new Set(['javascript', 'typescript', 'javascriptreact', 'typescriptreact']);

export function activate(context: vscode.ExtensionContext) {
  const testing = context.extensionMode === vscode.ExtensionMode.Test;
  const applied = testing ? new vscode.EventEmitter<vscode.TextEditor>() : undefined;
  if (applied) context.subscriptions.push(applied);
  const states = new WeakMap<vscode.TextEditor, AppliedState>();
  let sequence = 0;
  const options: Record<Style, vscode.DecorationRenderOptions> = {
    strong: { fontWeight: 'bold' }, emphasis: { fontStyle: 'italic' },
    delete: { textDecoration: 'line-through' },
    inlineCode: { backgroundColor: new vscode.ThemeColor('textCodeBlock.background') },
    heading: { fontWeight: 'bold', color: new vscode.ThemeColor('textLink.foreground') },
    marker: { opacity: '0', letterSpacing: '-1em' }
  };
  const types = new Map(Object.entries(options).map(([style, value]) => [style as Style, vscode.window.createTextEditorDecorationType({ ...value, rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed })]));
  context.subscriptions.push(...types.values());
  const boxHidden = vscode.window.createTextEditorDecorationType({ opacity: '0', rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed });
  const boxFrame = vscode.window.createTextEditorDecorationType({ rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed });
  const boxRule = vscode.window.createTextEditorDecorationType({ rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed });
  context.subscriptions.push(boxHidden, boxFrame, boxRule);
  const session = new RenderingSession();
  function update(editor: vscode.TextEditor) {
    const document = editor.document;
    const key = document.uri.toString();
    const active = editor.selections.map(selection => ({ start: document.offsetAt(selection.start), end: document.offsetAt(selection.end) }));
    function report(ranges: AppliedState['ranges'], boxes: AppliedState['boxes'] = []) {
      if (!applied) return;
      states.set(editor, { sequence: ++sequence, version: document.version, languageId: document.languageId, selections: active, ranges, boxes });
      applied.fire(editor);
    }
    if (!languages.has(document.languageId)) {
      session.close(key);
      for (const type of types.values()) editor.setDecorations(type, []);
      editor.setDecorations(boxHidden, []);
      editor.setDecorations(boxFrame, []);
      editor.setDecorations(boxRule, []);
      report([]);
      return;
    }
    // Selecting/clicking a comment reveals its complete source for editing.
    const { decorations: visible, boxes } = session.presentation(key, document.version, document.fileName, () => document.getText(), active, Number(editor.options.tabSize) || 4);
    for (const [style, type] of types) {
      const ranges = visible.filter(decoration => decoration.style === style).map(decoration => new vscode.Range(document.positionAt(decoration.start), document.positionAt(decoration.end)));
      editor.setDecorations(type, ranges);
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
    report(visible.map(({ style, start, end }) => ({ style, start, end })), boxes.map(({ anchor, text, marginColumns, ruleAnchor, hidden }) => ({ anchor, text, marginColumns, ruleAnchor, hidden })));
  }
  function updateVisible() { for (const editor of vscode.window.visibleTextEditors) update(editor); }
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownInCode.toggle', () => { session.toggle(); updateVisible(); }),
    vscode.window.onDidChangeVisibleTextEditors(updateVisible),
    vscode.window.onDidChangeTextEditorSelection(event => update(event.textEditor)),
    vscode.window.onDidChangeTextEditorOptions(event => update(event.textEditor)),
    vscode.workspace.onDidOpenTextDocument(updateVisible),
    vscode.workspace.onDidChangeTextDocument(event => { for (const editor of vscode.window.visibleTextEditors) if (editor.document === event.document) update(editor); }),
    vscode.workspace.onDidCloseTextDocument(document => session.close(document.uri.toString()))
  );
  updateVisible();
  if (applied) {
    return { snapshot: (editor: vscode.TextEditor) => {
      const state = states.get(editor);
      return state ? { ...state, selections: state.selections.map(value => ({ ...value })), ranges: state.ranges.map(value => ({ ...value })), boxes: state.boxes.map(box => ({ ...box, hidden: box.hidden.map(value => ({ ...value })) })) } : undefined;
    }, onDidApply: applied.event } satisfies TestApi;
  }
}
