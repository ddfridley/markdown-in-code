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
  const session = new RenderingSession();
  function update(editor: vscode.TextEditor) {
    const document = editor.document;
    const key = document.uri.toString();
    const active = editor.selections.map(selection => ({ start: document.offsetAt(selection.start), end: document.offsetAt(selection.end) }));
    function report(ranges: AppliedState['ranges']) {
      if (!applied) return;
      states.set(editor, { sequence: ++sequence, version: document.version, languageId: document.languageId, selections: active, ranges });
      applied.fire(editor);
    }
    if (!languages.has(document.languageId)) {
      session.close(key);
      for (const type of types.values()) editor.setDecorations(type, []);
      report([]);
      return;
    }
    // Selecting/clicking a comment reveals its complete source for editing.
    const visible = session.decorations(key, document.version, document.fileName, () => document.getText(), active);
    for (const [style, type] of types) {
      const ranges = visible.filter(decoration => decoration.style === style).map(decoration => new vscode.Range(document.positionAt(decoration.start), document.positionAt(decoration.end)));
      editor.setDecorations(type, ranges);
    }
    report(visible.map(({ style, start, end }) => ({ style, start, end })));
  }
  function updateVisible() { for (const editor of vscode.window.visibleTextEditors) update(editor); }
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownInCode.toggle', () => { session.toggle(); updateVisible(); }),
    vscode.window.onDidChangeVisibleTextEditors(updateVisible),
    vscode.window.onDidChangeTextEditorSelection(event => update(event.textEditor)),
    vscode.workspace.onDidOpenTextDocument(updateVisible),
    vscode.workspace.onDidChangeTextDocument(event => { for (const editor of vscode.window.visibleTextEditors) if (editor.document === event.document) update(editor); }),
    vscode.workspace.onDidCloseTextDocument(document => session.close(document.uri.toString()))
  );
  updateVisible();
  if (applied) {
    return { snapshot: (editor: vscode.TextEditor) => {
      const state = states.get(editor);
      return state ? { ...state, selections: state.selections.map(value => ({ ...value })), ranges: state.ranges.map(value => ({ ...value })) } : undefined;
    }, onDidApply: applied.event } satisfies TestApi;
  }
}
