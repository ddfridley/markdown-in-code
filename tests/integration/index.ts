import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TestApi, AppliedState } from '../../src/test-api';

const initial = 'const outside = "**raw string**";\n/**\n * # Heading\n * **bold** and *italic*\n */\nconst middle = 1; // **trailing**\n// *standalone*\n';
let api: TestApi;

/** Events acknowledge actual decoration application, without sleeps or forced refreshes. */
function waitFor(editor: vscode.TextEditor, predicate: (state: AppliedState) => boolean): Promise<AppliedState> {
  return new Promise((resolve, reject) => {
    let subscription: vscode.Disposable | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const state = api.snapshot(editor);
      if (!state || !predicate(state)) return;
      subscription?.dispose();
      clearTimeout(timer);
      resolve(state);
    };
    subscription = api.onDidApply(changed => { if (changed === editor) check(); });
    timer = setTimeout(() => {
      subscription?.dispose();
      reject(new Error(`No matching decoration update: ${JSON.stringify(api.snapshot(editor))}`));
    }, 8000);
    check();
  });
}

async function select(editor: vscode.TextEditor, spans: [number, number][]): Promise<AppliedState> {
  const previous = api.snapshot(editor)?.sequence ?? 0;
  const waiting = waitFor(editor, state => state.sequence > previous && state.selections.length === spans.length &&
    spans.every(([start, end], index) => state.selections[index].start === Math.min(start, end) && state.selections[index].end === Math.max(start, end)));
  editor.selections = spans.map(([start, end]) => new vscode.Selection(editor.document.positionAt(start), editor.document.positionAt(end)));
  return waiting;
}

function texts(editor: vscode.TextEditor, state: AppliedState, style: string): string[] {
  const source = editor.document.getText();
  return state.ranges.filter(range => range.style === style).map(range => source.slice(range.start, range.end));
}

export async function run(): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  assert.ok(workspace, 'The runner must provide its isolated workspace');
  const path = join(workspace, 'comments.ts');
  await writeFile(path, initial);
  const document = await vscode.workspace.openTextDocument(path);
  const editor = await vscode.window.showTextDocument(document);
  const extension = vscode.extensions.all.find(item => item.packageJSON.name === 'markdown-in-code');
  assert.ok(extension, 'Development extension is registered');
  api = await extension.activate() as TestApi;
  assert.ok(extension.isActive);
  assert.equal(typeof api?.snapshot, 'function', 'Test-only completion API available in test mode');
  assert.ok((await vscode.commands.getCommands()).includes('markdownInCode.toggle'));
  const passed: string[] = [];
  async function test(name: string, action: () => Promise<void>) {
    try {
      await action();
      passed.push(name);
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}`);
      console.error(error);
      throw error;
    }
  }
  try {
    await test('activation and initial applied source ranges', async () => {
      const state = await waitFor(editor, value => value.version === document.version && value.ranges.length > 0);
      assert.deepEqual(texts(editor, state, 'strong'), ['bold', 'trailing']);
      assert.deepEqual(texts(editor, state, 'heading'), ['Heading']);
      assert.deepEqual(texts(editor, state, 'emphasis'), ['italic', 'standalone']);
      for (const range of state.ranges) assert.ok(range.start >= initial.indexOf('/**'));
      assert.equal(document.isDirty, false);
      assert.equal(document.getText(), initial);
      assert.equal(await readFile(path, 'utf8'), initial);
    });

    await test('cursor reveals a complete block and leaving restores formatting', async () => {
      const state = await select(editor, [[initial.indexOf('Heading'), initial.indexOf('Heading')]]);
      assert.deepEqual(texts(editor, state, 'heading'), []);
      assert.deepEqual(texts(editor, state, 'strong'), ['trailing']);
      const restored = await select(editor, [[0, 0]]);
      assert.deepEqual(texts(editor, restored, 'strong'), ['bold', 'trailing']);
    });

    await test('multiline/reversed selection and multiple carets reveal all crossed comments', async () => {
      const end = initial.indexOf('standalone') + 2;
      assert.equal((await select(editor, [[end, initial.indexOf('Heading')]])).ranges.length, 0);
      const offsets = [initial.indexOf('Heading'), initial.indexOf('trailing'), initial.indexOf('standalone')];
      assert.equal((await select(editor, offsets.map(offset => [offset, offset]))).ranges.length, 0);
      assert.ok((await select(editor, [[0, 0]])).ranges.length > 0);
    });

    await test('command toggles every visible editor and edits refresh while disabled', async () => {
      const previous = api.snapshot(editor)!.sequence;
      const disabled = waitFor(editor, state => state.sequence > previous && state.ranges.length === 0);
      await vscode.commands.executeCommand('markdownInCode.toggle');
      await disabled;
      const offset = document.getText().indexOf('bold');
      await editor.edit(builder => builder.replace(new vscode.Range(document.positionAt(offset), document.positionAt(offset + 4)), 'updated'));
      const editedVersion = document.version;
      await waitFor(editor, state => state.version === editedVersion && state.ranges.length === 0);
      const enabled = waitFor(editor, state => state.version === editedVersion && texts(editor, state, 'strong').includes('updated'));
      await vscode.commands.executeCommand('markdownInCode.toggle');
      await enabled;
      assert.equal(await readFile(path, 'utf8'), initial, 'Only the deliberate in-memory edit changes source');
    });

    await test('edits while rendered invalidate applied offsets', async () => {
      const version = document.version;
      await editor.edit(builder => builder.insert(new vscode.Position(0, 0), '// prefix\n'));
      const state = await waitFor(editor, value => value.version > version && texts(editor, value, 'strong').includes('updated'));
      const strong = state.ranges.find(range => range.style === 'strong')!;
      assert.equal(strong.start, document.getText().indexOf('updated'));
      assert.equal(state.ranges.some(range => range.start < '// prefix\n'.length), false);
    });

    await test('switching editors and split views keep independent selection visibility', async () => {
      const otherPath = join(workspace, 'other.js');
      await writeFile(otherPath, 'const x = 1; // **other**');
      const other = await vscode.workspace.openTextDocument(otherPath);
      const otherEditor = await vscode.window.showTextDocument(other, vscode.ViewColumn.One);
      await waitFor(otherEditor, state => texts(otherEditor, state, 'strong').includes('other'));
      await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
      const left = vscode.window.activeTextEditor!;
      const offset = document.getText().indexOf('Heading');
      await select(left, [[offset, offset]]);
      const right = await vscode.window.showTextDocument(document, vscode.ViewColumn.Two);
      // Use a distinct initial position so both selection updates are real events.
      await select(right, [[1, 1]]);
      const leftState = await waitFor(left, state => !texts(left, state, 'strong').includes('updated'));
      assert.equal(texts(left, leftState, 'heading').length, 0);
      assert.ok(texts(right, api.snapshot(right)!, 'strong').includes('updated'));
      const before = api.snapshot(right)!.sequence;
      const disabled = waitFor(right, state => state.sequence > before && state.ranges.length === 0);
      await vscode.commands.executeCommand('markdownInCode.toggle');
      await disabled;
      assert.equal(api.snapshot(left)!.ranges.length, 0);
      await vscode.commands.executeCommand('markdownInCode.toggle');
      await waitFor(right, state => texts(right, state, 'strong').includes('updated'));
    });

    await test('language changes clear decorations and restore TypeScript rendering', async () => {
      const right = vscode.window.activeTextEditor!;
      await vscode.languages.setTextDocumentLanguage(document, 'plaintext');
      await waitFor(right, state => state.languageId === 'plaintext' && state.ranges.length === 0);
      await vscode.languages.setTextDocumentLanguage(document, 'typescript');
      await waitFor(right, state => state.languageId === 'typescript' && texts(right, state, 'strong').includes('updated'));
    });

    await test('standalone Markdown is left raw', async () => {
      const markdownPath = join(workspace, 'standalone.md');
      await writeFile(markdownPath, '# Heading\n**raw**');
      const markdown = await vscode.workspace.openTextDocument(markdownPath);
      const markdownEditor = await vscode.window.showTextDocument(markdown, vscode.ViewColumn.One);
      const state = await waitFor(markdownEditor, value => value.languageId === 'markdown');
      assert.deepEqual(state.ranges, []);
      assert.equal(markdown.getText(), '# Heading\n**raw**');
    });

    await test('closing and reopening editor tabs uses new source', async () => {
      await document.save();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await writeFile(path, 'const clean = 1; // **reopened**');
      const reopened = await vscode.workspace.openTextDocument(path);
      const reopenedEditor = await vscode.window.showTextDocument(reopened);
      // VS Code restores the old cursor, which can now lie inside the shorter comment.
      reopenedEditor.selection = new vscode.Selection(0, 0, 0, 0);
      const state = await waitFor(reopenedEditor, value => texts(reopenedEditor, value, 'strong').includes('reopened'));
      assert.deepEqual(texts(reopenedEditor, state, 'strong'), ['reopened']);
      assert.equal(reopened.isDirty, false);
    });

    await test('untitled document disposal leaves no visible editor', async () => {
      const untitled = await vscode.workspace.openTextDocument({ language: 'typescript', content: 'const x = 1; // **temporary**' });
      const temporaryEditor = await vscode.window.showTextDocument(untitled);
      await waitFor(temporaryEditor, state => texts(temporaryEditor, state, 'strong').includes('temporary'));
      const closed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { subscription.dispose(); reject(new Error('Untitled document was not disposed')); }, 8000);
        const subscription = vscode.workspace.onDidCloseTextDocument(value => {
          if (value.uri.toString() !== untitled.uri.toString()) return;
          clearTimeout(timer);
          subscription.dispose();
          resolve();
        });
      });
      await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      await closed;
      assert.equal(untitled.isClosed, true);
      assert.ok(!vscode.window.visibleTextEditors.includes(temporaryEditor));
    });
    console.log(`Integration checks: ${passed.length} passed (VS Code ${vscode.version})`);
  } finally {
    // Fixtures are in the runner's isolated workspace; leave logs for diagnosis.
    await vscode.workspace.saveAll(false);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  }
}
