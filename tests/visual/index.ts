import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join } from 'node:path';
import type { TestApi, AppliedState } from '../../src/test-api';

let api: TestApi;
function applied(editor: vscode.TextEditor, predicate: (state: AppliedState) => boolean): Promise<AppliedState> {
  return new Promise((resolve, reject) => {
    const subscription = api.onDidApply(changed => { if (changed === editor) check(); });
    const timer = setTimeout(() => { subscription.dispose(); reject(new Error('Visual fixture decoration update timed out')); }, 10000);
    function check() {
      const state = api.snapshot(editor);
      if (!state || !predicate(state)) return;
      clearTimeout(timer); subscription.dispose(); resolve(state);
    }
    check();
  });
}
async function capture(name: string, width = 1200, controlClick?: string, plainClick?: string) {
  await vscode.commands.executeCommand('notifications.clearAll');
  const bridge = process.env.MIC_VISUAL_BRIDGE!;
  const acknowledgment = join(bridge, 'acks', `${name}.json`);
  const finished = new Promise<void>((resolve, reject) => {
    let done = false;
    const watcher = watch(join(bridge, 'acks'), () => { void check(); });
    const timer = setTimeout(() => { done = true; watcher.close(); reject(new Error(`Capture timed out: ${name}`)); }, 30000);
    async function check() {
      try {
        const result = JSON.parse(await readFile(acknowledgment, 'utf8'));
        if (done) return;
        done = true; clearTimeout(timer); watcher.close();
        if (result.error) reject(new Error(result.error)); else resolve();
      } catch { /* Wait for a complete acknowledgement file. */ }
    }
    void check();
  });
  await writeFile(join(bridge, 'requests', `${name}.json`), JSON.stringify({ name, width, theme: name.endsWith('-dark') ? 'dark' : 'light', controlClick, plainClick }));
  await finished;
}

export async function run() {
  assert.equal(vscode.version, '1.100.3');
  const workspace = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const extension = vscode.extensions.all.find(value => value.packageJSON.name === 'markdown-in-code')!;
  api = await extension.activate() as TestApi;
  // Startup can run the test suite before the configured built-in theme loads.
  // Force a configuration transition: writing the existing setting is a no-op.
  await vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Global);
  await vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Light Modern', vscode.ConfigurationTarget.Global);
  if (vscode.window.activeColorTheme.kind !== vscode.ColorThemeKind.Light) {
    await new Promise<void>((resolve, reject) => {
      const listener = vscode.window.onDidChangeActiveColorTheme(theme => {
        if (theme.kind === vscode.ColorThemeKind.Light) { clearTimeout(timer); listener.dispose(); resolve(); }
      });
      const timer = setTimeout(() => { listener.dispose(); reject(new Error('Initial light theme timed out')); }, 10000);
    });
  }
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  await vscode.commands.executeCommand('workbench.action.closePanel');
  async function open(name: string) {
    const document = await vscode.workspace.openTextDocument(join(workspace, name));
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    await applied(editor, state => state.boxes.length > 0 && state.ranges.length > 0);
    return editor;
  }
  const block = await open('block.ts');
  await capture('block-light');
  const previous = api.snapshot(block)!.sequence;
  const selected = applied(block, state => state.sequence > previous && state.boxes.length === 0);
  block.selection = new vscode.Selection(2, 3, 6, 10);
  await selected;
  await capture('block-selected-light');
  const restored = applied(block, state => state.boxes.length > 0);
  block.selection = new vscode.Selection(0, 0, 0, 0);
  await restored;
  await capture('block-narrow-light', 850);
  await vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Global);
  if (vscode.window.activeColorTheme.kind !== vscode.ColorThemeKind.Dark) {
    await new Promise<void>((resolve, reject) => {
      const listener = vscode.window.onDidChangeActiveColorTheme(theme => {
        if (theme.kind === vscode.ColorThemeKind.Dark) { clearTimeout(timer); listener.dispose(); resolve(); }
      });
      const timer = setTimeout(() => { listener.dispose(); reject(new Error('Dark theme timed out')); }, 10000);
    });
  }
  await capture('block-dark');
  await vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Light Modern', vscode.ConfigurationTarget.Global);
  if (vscode.window.activeColorTheme.kind !== vscode.ColorThemeKind.Light) {
    await new Promise<void>((resolve, reject) => {
      const listener = vscode.window.onDidChangeActiveColorTheme(theme => {
        if (theme.kind === vscode.ColorThemeKind.Light) { clearTimeout(timer); listener.dispose(); resolve(); }
      });
      const timer = setTimeout(() => { listener.dispose(); reject(new Error('Light theme timed out')); }, 10000);
    });
  }
  await open('standalone.ts');
  await capture('standalone-light');
  await open('horizontal-rules.ts');
  await capture('horizontal-rules-light');
  await open('unordered-lists.ts');
  await capture('unordered-lists-light');
  await open('ordered-tasks.ts');
  await capture('ordered-tasks-light');
  await open('blockquotes.ts');
  await capture('blockquotes-light');
  await open('tables.ts');
  await capture('tables-light');
  await capture('tables-narrow-light', 850);
  const longTable = await open('tables-long.ts');
  assert.deepEqual(longTable.document.getText().slice(api.snapshot(longTable)!.ranges.find(value => value.style === 'tableHeader')!.start,
    api.snapshot(longTable)!.ranges.find(value => value.style === 'tableHeader')!.end), 'Order');
  await capture('tables-long-light');
  await vscode.workspace.getConfiguration('editor', longTable.document).update('wordWrap', 'on', vscode.ConfigurationTarget.Global);
  await capture('tables-long-wrapped-light');
  await capture('tables-long-scrolled-light');
  await vscode.workspace.getConfiguration('editor', longTable.document).update('wordWrap', 'off', vscode.ConfigurationTarget.Global);
  const plainLinks = await open('links.ts');
  await capture('links-light', 1200, undefined, 'Local fixture');
  assert.equal(vscode.window.activeTextEditor, plainLinks, 'Plain click must not navigate');
  const localLabel = plainLinks.document.getText().indexOf('Local fixture');
  await applied(plainLinks, state => !state.ranges.some(value => value.style === 'link' && value.start === localLabel));
  assert.equal(vscode.window.activeTextEditor, plainLinks, 'Plain click must edit rather than navigate');
  console.log('PASS normal link click reveals source without navigation');
  const headings = await open('headings.ts');
  await capture('headings-light');
  await capture('headings-narrow-light', 850);
  const tight = applied(headings, state => state.headingSizes[0] === 24 && state.headingSizes[1] === 20);
  await vscode.workspace.getConfiguration('editor').update('lineHeight', 16, vscode.ConfigurationTarget.Global);
  await tight;
  await capture('headings-tight-light');
  const normal = applied(headings, state => state.headingSizes[0] > 16);
  await vscode.workspace.getConfiguration('editor').update('lineHeight', 24, vscode.ConfigurationTarget.Global);
  await normal;
  const wrapped = await open('headings-wrap.ts');
  const wrapSequence = api.snapshot(wrapped)!.sequence;
  const wrapReady = applied(wrapped, state => state.sequence > wrapSequence && state.headingSizes[0] === 24 && state.headingSizes[1] === 20);
  await vscode.workspace.getConfiguration('editor').update('wordWrap', 'on', vscode.ConfigurationTarget.Global);
  await wrapReady;
  await vscode.commands.executeCommand('workbench.view.explorer');
  await vscode.workspace.getConfiguration('editor').update('minimap.enabled', true, vscode.ConfigurationTarget.Global);
  await capture('headings-wrapped-light', 850);
  await vscode.workspace.getConfiguration('editor').update('minimap.enabled', false, vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  await vscode.workspace.getConfiguration('editor').update('wordWrap', 'off', vscode.ConfigurationTarget.Global);
  await open('fenced.ts');
  await capture('fenced-light');
  await vscode.commands.executeCommand('workbench.view.explorer');
  await capture('fenced-sidebar-light');
  await vscode.workspace.getConfiguration('editor').update('minimap.enabled', true, vscode.ConfigurationTarget.Global);
  await capture('fenced-minimap-light');
  await vscode.workspace.getConfiguration('editor').update('minimap.enabled', false, vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  await vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Global);
  if (vscode.window.activeColorTheme.kind !== vscode.ColorThemeKind.Dark) {
    await new Promise<void>((resolve, reject) => {
      const listener = vscode.window.onDidChangeActiveColorTheme(theme => {
        if (theme.kind === vscode.ColorThemeKind.Dark) { clearTimeout(timer); listener.dispose(); resolve(); }
      });
      const timer = setTimeout(() => { listener.dispose(); reject(new Error('Fenced dark theme timed out')); }, 10000);
    });
  }
  await capture('fenced-dark');
  await open('headings.ts');
  await capture('headings-dark');
  await open('unordered-lists.ts');
  await capture('unordered-lists-dark');
  await open('ordered-tasks.ts');
  await capture('ordered-tasks-dark');
  await open('blockquotes.ts');
  await capture('blockquotes-dark');
  await open('tables.ts');
  await capture('tables-dark');
  const linksEditor = await open('links.ts');
  await vscode.commands.executeCommand('vscode.executeLinkProvider', linksEditor.document.uri);
  const originalSelection = linksEditor.selection;
  const navigated = new Promise<void>((resolve, reject) => {
    const subscription = vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor?.document.fileName.endsWith('unordered-lists.ts')) { clearTimeout(timer); subscription.dispose(); resolve(); }
    });
    const timer = setTimeout(() => { subscription.dispose(); reject(new Error('Native Ctrl+click did not open local fixture')); }, 10000);
  });
  await capture('links-dark', 1200, 'Local fixture');
  await navigated;
  assert.ok(linksEditor.selection.isEqual(originalSelection), 'Ctrl+click must not move the source selection');
  assert.ok(api.snapshot(linksEditor)!.ranges.some(value => value.style === 'link'), 'Ctrl+click must not reveal raw source');
  console.log('PASS native Ctrl+click opens local target without source reveal');
  console.log('Visual fixtures: 29 captured');
}
