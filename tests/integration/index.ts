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
      assert.equal(state.boxes[0].text, '┌');
      assert.equal(state.boxes.at(-1)!.text, '└');
      assert.ok(state.boxes[0].ruleAnchor !== undefined);
      assert.ok(state.boxes.at(-1)!.ruleAnchor !== undefined);
      assert.equal(state.boxes.filter(box => box.text === '│ ').length, 2);
      for (const range of state.ranges) assert.ok(range.start >= initial.indexOf('/**'));
      assert.equal(document.isDirty, false);
      assert.equal(document.getText(), initial);
      assert.equal(await readFile(path, 'utf8'), initial);
    });

    await test('cursor reveals a complete block and leaving restores formatting', async () => {
      const state = await select(editor, [[initial.indexOf('Heading'), initial.indexOf('Heading')]]);
      assert.deepEqual(texts(editor, state, 'heading'), []);
      assert.deepEqual(state.boxes, []);
      assert.deepEqual(texts(editor, state, 'strong'), ['trailing']);
      const restored = await select(editor, [[0, 0]]);
      assert.deepEqual(texts(editor, restored, 'strong'), ['bold', 'trailing']);
      assert.ok(restored.boxes.length > 0);
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
      assert.deepEqual(api.snapshot(editor)!.boxes, []);
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
      assert.deepEqual(api.snapshot(right)!.boxes, []);
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
    await test('plain block boxes normalize mixed prefixes and refresh tab layout', async () => {
      const source = 'const outside = 1;\n\t/**\n\t * first\n* second\n// third\nfourth\n\t */';
      const boxPath = join(workspace, 'boxes.ts');
      await writeFile(boxPath, source);
      const boxDocument = await vscode.workspace.openTextDocument(boxPath);
      const boxEditor = await vscode.window.showTextDocument(boxDocument);
      const state = await waitFor(boxEditor, value => value.boxes.length === 6);
      assert.ok(state.ranges.every(value => value.style === 'commentText'));
      assert.deepEqual(texts(boxEditor, state, 'commentText').map(value => value.trim()).filter(Boolean), ['first', 'second', 'third', 'fourth']);
      assert.equal(state.boxes.filter(box => box.text === '│ ').length, 4);
      const version = boxDocument.version;
      const sequence = state.sequence;
      const updated = waitFor(boxEditor, value => value.sequence > sequence && value.boxes.length === 6);
      boxEditor.options = { tabSize: Number(boxEditor.options.tabSize) === 8 ? 2 : 8 };
      const changed = await updated;
      assert.equal(changed.version, version);
      assert.notEqual(changed.boxes[2].marginColumns, state.boxes[2].marginColumns);
      const offset = source.indexOf('first');
      assert.deepEqual((await select(boxEditor, [[offset, offset]])).boxes, []);
      assert.equal(boxDocument.getText(), source);
      assert.equal(boxDocument.isDirty, false);
    });
    await test('consecutive standalone comments share block formatting and editing state', async () => {
      const source = 'const before = 1;\n// # Group heading\n// **middle**\n// end\n\nconst after = 2; // **trailing**';
      const groupPath = join(workspace, 'line-blocks.ts');
      await writeFile(groupPath, source);
      const groupDocument = await vscode.workspace.openTextDocument(groupPath);
      const groupEditor = await vscode.window.showTextDocument(groupDocument);
      const state = await waitFor(groupEditor, value => value.boxes.length === 3);
      assert.deepEqual(texts(groupEditor, state, 'heading'), ['Group heading']);
      assert.deepEqual(texts(groupEditor, state, 'strong'), ['middle', 'trailing']);
      assert.deepEqual(state.boxes.map(box => box.text), ['┌ ', '│ ', '└ ']);
      assert.equal(state.boxes.filter(box => box.ruleAnchor !== undefined).length, 2);
      const offset = source.indexOf('middle');
      const raw = await select(groupEditor, [[offset, offset]]);
      assert.deepEqual(raw.boxes, []);
      assert.deepEqual(texts(groupEditor, raw, 'strong'), ['trailing']);
      assert.equal((await select(groupEditor, [[0, 0]])).boxes.length, 3);
      assert.equal(groupDocument.getText(), source);
      assert.equal(groupDocument.isDirty, false);
    });
    await test('same-line block comments keep delimiters and have inline formatting without frames', async () => {
      const source = 'const x = 1; /* **Inline comment** */\n/* # Not a block heading */';
      const inlinePath = join(workspace, 'inline.ts');
      await writeFile(inlinePath, source);
      const inlineDocument = await vscode.workspace.openTextDocument(inlinePath);
      const inlineEditor = await vscode.window.showTextDocument(inlineDocument);
      const state = await waitFor(inlineEditor, value => texts(inlineEditor, value, 'strong').includes('Inline comment'));
      assert.deepEqual(state.boxes, []);
      assert.deepEqual(texts(inlineEditor, state, 'heading'), []);
      assert.deepEqual(texts(inlineEditor, state, 'marker'), ['**', '**']);
      assert.equal(inlineDocument.getText(), source);
      assert.equal(inlineDocument.isDirty, false);
    });
    await test('fenced code gets contrasting tokens, restores after editing, and changes palette with the theme', async () => {
      const source = 'const outside = 1;\n/**\n * ```ts\n * const value = "**literal**";\n * // a code comment\n * ```\n */';
      const codePath = join(workspace, 'fenced.ts');
      await writeFile(codePath, source);
      const codeDocument = await vscode.workspace.openTextDocument(codePath);
      const codeEditor = await vscode.window.showTextDocument(codeDocument);
      const state = await waitFor(codeEditor, value => value.ranges.some(range => range.style === 'codeKeyword'));
      assert.deepEqual(texts(codeEditor, state, 'codeKeyword'), ['const']);
      assert.deepEqual(texts(codeEditor, state, 'codeString'), ['"**literal**"']);
      assert.deepEqual(texts(codeEditor, state, 'codeFence'), ['```ts', '```']);
      assert.deepEqual(texts(codeEditor, state, 'strong'), []);
      const offset = source.indexOf('value');
      assert.equal((await select(codeEditor, [[offset, offset]])).ranges.length, 0);
      await select(codeEditor, [[0, 0]]);
      const before = api.snapshot(codeEditor)!.sequence;
      const disabled = waitFor(codeEditor, value => value.sequence > before && value.ranges.length === 0);
      await vscode.commands.executeCommand('markdownInCode.toggle');
      await disabled;
      await vscode.commands.executeCommand('markdownInCode.toggle');
      await waitFor(codeEditor, value => value.ranges.some(range => range.style === 'codeKeyword'));
      const originalTheme = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme');
      try {
        await vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Light Modern', vscode.ConfigurationTarget.Global);
        const light = await waitFor(codeEditor, value => value.codeAppearance === 'dark' && value.ranges.some(range => range.style === 'codeBackground'));
        assert.equal(light.version, codeDocument.version);
        await vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Global);
        const dark = await waitFor(codeEditor, value => value.codeAppearance === 'light' && value.ranges.some(range => range.style === 'codeBackground'));
        assert.equal(dark.version, light.version);
      } finally {
        await vscode.workspace.getConfiguration('workbench').update('colorTheme', originalTheme, vscode.ConfigurationTarget.Global);
      }
      assert.equal(codeDocument.getText(), source);
      assert.equal(codeDocument.isDirty, false);
    });
    await test('horizontal rules render only in framed comments and follow reveal and toggle state', async () => {
      const source = 'const outside = 1;\n/**\n * Before\n *\n * ---\n *\n * After\n */\nconst inline = 1; /* --- */';
      const path = join(workspace, 'horizontal-rules.ts');
      await writeFile(path, source);
      const document = await vscode.workspace.openTextDocument(path);
      const editor = await vscode.window.showTextDocument(document);
      editor.selection = new vscode.Selection(0, 0, 0, 0);
      const rendered = await waitFor(editor, state => texts(editor, state, 'horizontalRule').length === 1);
      assert.deepEqual(texts(editor, rendered, 'horizontalRule'), ['---']);
      const offset = source.indexOf('---');
      assert.equal((await select(editor, [[offset, offset]])).ranges.length, 0);
      assert.deepEqual(texts(editor, await select(editor, [[0, 0]]), 'horizontalRule'), ['---']);
      await vscode.commands.executeCommand('markdownInCode.toggle');
      await waitFor(editor, state => state.ranges.length === 0);
      await vscode.commands.executeCommand('markdownInCode.toggle');
      await waitFor(editor, state => texts(editor, state, 'horizontalRule').length === 1);
      assert.equal(document.getText(), source);
      assert.equal(document.isDirty, false);
    });
    await test('heading levels, Setext markers, row budgets and edits preserve interaction state', async () => {
      const source = 'const outside = 1;\n/**\n * # Title\n * ## Second\n *\n * Setext\n * ===\n */';
      const path = join(workspace, 'headings.ts');
      await writeFile(path, source);
      const document = await vscode.workspace.openTextDocument(path);
      const editor = await vscode.window.showTextDocument(document);
      const rendered = await waitFor(editor, state => state.ranges.filter(value => value.style === 'heading').length === 3);
      assert.deepEqual(rendered.ranges.filter(value => value.style === 'heading').map(value => value.level), [1, 2, 1]);
      assert.ok(texts(editor, rendered, 'marker').includes('==='));
      assert.equal((await select(editor, [[source.indexOf('Title'), source.indexOf('Title')]])).ranges.length, 0);
      await select(editor, [[0, 0]]);
      const settings = vscode.workspace.getConfiguration('editor');
      const original = Object.fromEntries(['fontSize', 'lineHeight', 'wordWrap'].map(key => [key, settings.inspect(key)?.workspaceValue]));
      try {
        await settings.update('wordWrap', 'off', vscode.ConfigurationTarget.Workspace);
        await settings.update('fontSize', 16, vscode.ConfigurationTarget.Workspace);
        await settings.update('lineHeight', 32, vscode.ConfigurationTarget.Workspace);
        const enlarged = await waitFor(editor, state => state.headingSizes[0] === 24);
        assert.equal(enlarged.version, document.version);
        await settings.update('lineHeight', 16, vscode.ConfigurationTarget.Workspace);
        await waitFor(editor, state => state.headingSizes[0] === 24 && state.headingSizes[1] === 20);
        await settings.update('lineHeight', 32, vscode.ConfigurationTarget.Workspace);
        await settings.update('wordWrap', 'on', vscode.ConfigurationTarget.Workspace);
        await waitFor(editor, state => state.headingSizes[0] === 24 && state.headingSizes[1] === 20);
        assert.equal(document.getText(), source);
        assert.equal(document.isDirty, false);
        await vscode.commands.executeCommand('markdownInCode.toggle');
        await waitFor(editor, state => state.ranges.length === 0);
        await vscode.commands.executeCommand('markdownInCode.toggle');
        await waitFor(editor, state => state.ranges.some(value => value.style === 'heading'));
        const position = document.positionAt(source.indexOf('# Title'));
        await editor.edit(edit => edit.insert(position, '#'));
        const edited = await waitFor(editor, state => state.version === document.version && state.ranges.filter(value => value.style === 'heading')[0]?.level === 2);
        assert.ok(texts(editor, edited, 'heading').includes('Title'));
        assert.equal(document.getText(), source.replace('# Title', '## Title'));
      } finally {
        for (const key of Object.keys(original)) await settings.update(key, original[key], vscode.ConfigurationTarget.Workspace);
      }
    });
    await test('unordered bullets preserve nesting, editing, source reveal and toggling', async () => {
      const source = 'const outside=1;\n/**\n * - **Parent**\n *   - Child\n */';
      const path = join(workspace, 'unordered-lists.ts');
      await writeFile(path, source);
      const document = await vscode.workspace.openTextDocument(path);
      const editor = await vscode.window.showTextDocument(document);
      const rendered = await waitFor(editor, state => texts(editor, state, 'listMarker').length === 2);
      assert.deepEqual(texts(editor, rendered, 'listMarker'), ['-', '-']);
      assert.deepEqual(texts(editor, rendered, 'strong'), ['Parent']);
      assert.equal(document.getText(), source);
      assert.equal(document.isDirty, false);
      const child = source.indexOf('Child');
      assert.equal((await select(editor, [[child, child]])).ranges.length, 0);
      await select(editor, [[0, 0]]);
      await vscode.commands.executeCommand('markdownInCode.toggle');
      await waitFor(editor, state => state.ranges.length === 0);
      await editor.edit(edit => edit.replace(new vscode.Range(document.positionAt(child), document.positionAt(child + 5)), 'Updated child'));
      await vscode.commands.executeCommand('markdownInCode.toggle');
      const restored = await waitFor(editor, state => state.version === document.version && texts(editor, state, 'listMarker').length === 2);
      assert.ok(texts(editor, restored, 'commentText').join('').includes('Updated child'));
      assert.equal(document.getText(), source.replace('Child', 'Updated child'));
    });
    await test('ordered and task markers reveal, restore and update after editing', async () => {
      const source = 'const outside=1;\n/**\n * 3) First\n * 1) Second\n *\n * - [ ] Pending\n * - [x] Done\n */';
      const path = join(workspace, 'ordered-tasks.ts');
      await writeFile(path, source);
      const document = await vscode.workspace.openTextDocument(path);
      const editor = await vscode.window.showTextDocument(document);
      const rendered = await waitFor(editor, state => texts(editor, state, 'taskMarker').length === 2);
      assert.deepEqual(texts(editor, rendered, 'orderedMarker'), ['3)', '1)']);
      assert.deepEqual(texts(editor, rendered, 'taskMarker'), ['-', '-']);
      assert.equal(document.isDirty, false);
      const pending = source.indexOf('Pending');
      assert.equal((await select(editor, [[pending, pending]])).ranges.length, 0);
      await select(editor, [[0, 0]]);
      await vscode.commands.executeCommand('markdownInCode.toggle');
      await waitFor(editor, state => state.ranges.length === 0);
      const check = source.indexOf('[ ]') + 1;
      await editor.edit(edit => edit.replace(new vscode.Range(document.positionAt(check), document.positionAt(check + 1)), 'x'));
      await vscode.commands.executeCommand('markdownInCode.toggle');
      const restored = await waitFor(editor, state => state.version === document.version && texts(editor, state, 'taskMarker').length === 2);
      assert.deepEqual(texts(editor, restored, 'taskMarker'), ['-', '-']);
      assert.equal(document.getText(), source.replace('[ ]', '[x]'));
    });
    await test('nested blockquotes retain contained Markdown and source editing', async () => {
      const source = 'const outside=1;\n/**\n * > # Heading\n * >\n * > > Nested\n * >\n * > ```ts\n * > const answer=42;\n * > ```\n */';
      const path = join(workspace, 'blockquotes.ts');
      await writeFile(path, source);
      const document = await vscode.workspace.openTextDocument(path);
      const editor = await vscode.window.showTextDocument(document);
      const rendered = await waitFor(editor, state => texts(editor, state, 'quoteMarker').length === 8);
      assert.deepEqual(texts(editor, rendered, 'heading'), ['Heading']);
      assert.deepEqual(texts(editor, rendered, 'codeKeyword'), ['const']);
      assert.deepEqual(texts(editor, rendered, 'codeFence'), ['```ts', '```']);
      assert.equal(document.isDirty, false);
      const nested = source.indexOf('Nested');
      assert.equal((await select(editor, [[nested, nested]])).ranges.length, 0);
      await select(editor, [[0, 0]]);
      await waitFor(editor, state => texts(editor, state, 'quoteMarker').length === 8);
      await vscode.commands.executeCommand('markdownInCode.toggle');
      await waitFor(editor, state => state.ranges.length === 0);
      await editor.edit(edit => edit.replace(new vscode.Range(document.positionAt(nested), document.positionAt(nested + 6)), 'Updated'));
      await vscode.commands.executeCommand('markdownInCode.toggle');
      const restored = await waitFor(editor, state => state.version === document.version && texts(editor, state, 'quoteMarker').length === 8);
      assert.ok(texts(editor, restored, 'commentText').join('').includes('Updated'));
      assert.equal(document.getText(), source.replace('Nested', 'Updated'));
    });
    await test('link labels reveal source and explicit activation opens a local target', async () => {
      const targetPath = join(workspace, 'link-target.ts');
      await writeFile(targetPath, 'export const target = true;');
      const source = 'const outside=1;\n/**\n * [**Local target**](./link-target.ts "Target")\n */';
      const path = join(workspace, 'links.ts');
      await writeFile(path, source);
      const document = await vscode.workspace.openTextDocument(path);
      let editor = await vscode.window.showTextDocument(document);
      const rendered = await waitFor(editor, state => texts(editor, state, 'link').length === 1);
      assert.deepEqual(texts(editor, rendered, 'link'), ['**Local target**']);
      assert.deepEqual(texts(editor, rendered, 'strong'), ['Local target']);
      const provided = await vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', document.uri);
      assert.ok(provided?.some(link => document.getText(link.range).trim() === '[**Local target**](./link-target.ts "Target")' && link.target?.scheme === 'command' && JSON.parse(decodeURIComponent(link.target.query))[1] === './link-target.ts'));
      const nativeLink = provided!.find(link => document.getText(link.range).trim() === '[**Local target**](./link-target.ts "Target")')!;
      assert.equal(JSON.parse(decodeURIComponent(nativeLink.target!.query))[0], document.uri.toString(), 'Command URI must preserve encoded Windows drive colons');
      assert.equal(document.isDirty, false);
      const label = source.indexOf('Local target');
      assert.equal((await select(editor, [[label, label]])).ranges.length, 0);
      await vscode.commands.executeCommand('markdownInCode.openLink');
      assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), vscode.Uri.file(targetPath).toString());
      editor = await vscode.window.showTextDocument(document);
      await select(editor, [[0, 0]]);
      await waitFor(editor, state => texts(editor, state, 'link').length === 1);
      await vscode.commands.executeCommand('markdownInCode.toggle');
      await waitFor(editor, state => state.ranges.length === 0);
      await vscode.commands.executeCommand('markdownInCode.toggle');
      await waitFor(editor, state => texts(editor, state, 'link').length === 1);
      assert.equal(document.getText(), source);
    });
    await test('same-line comment links render and provide native navigation', async () => {
      const source = 'const outside=1; /* [Inline target](./link-target.ts) */';
      const path = join(workspace, 'inline-links.ts');
      await writeFile(path, source);
      const document = await vscode.workspace.openTextDocument(path);
      const editor = await vscode.window.showTextDocument(document);
      const rendered = await waitFor(editor, state => texts(editor, state, 'link').length === 1);
      assert.deepEqual(texts(editor, rendered, 'link'), ['Inline target']);
      assert.equal(rendered.boxes.length, 0);
      const provided = await vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', document.uri);
      assert.ok(provided?.some(link => document.getText(link.range).trim() === '[Inline target](./link-target.ts)' && link.target?.scheme === 'command' && JSON.parse(decodeURIComponent(link.target.query))[1] === './link-target.ts'));
      const label = source.indexOf('Inline target');
      assert.equal((await select(editor, [[label, label]])).ranges.length, 0);
      assert.equal(document.getText(), source);
      assert.equal(document.isDirty, false);
    });
    console.log(`Integration checks: ${passed.length} passed (VS Code ${vscode.version})`);
  } finally {
    // Fixtures are in the runner's isolated workspace; leave logs for diagnosis.
    await vscode.workspace.saveAll(false);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  }
}
