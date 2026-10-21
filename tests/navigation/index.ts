import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TestApi } from '../../src/test-api';

async function until(predicate: () => boolean | Promise<boolean>, label: string) {
  const deadline = Date.now() + 10000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

export async function run() {
  const api = await vscode.extensions.all.find(value => value.packageJSON.name === 'markdown-in-code')!.activate() as TestApi;
  const document = await vscode.workspace.openTextDocument(join(vscode.workspace.workspaceFolders![0].uri.fsPath, 'links.ts'));
  let editor = await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
  await vscode.workspace.getConfiguration('editor').update('minimap.enabled', false, vscode.ConfigurationTarget.Global);
  editor.selection = new vscode.Selection(0, 0, 0, 0);
  await until(() => !!api.snapshot(editor)?.ranges.some(value => value.style === 'link'), 'initial rendering');
  await vscode.commands.executeCommand('vscode.executeLinkProvider', document.uri);
  // The renderer computes native link decorations asynchronously after model open.
  await new Promise(resolve => setTimeout(resolve, 1500));
  const cases = [
    ['Readable label', 'https://example.com/'], ['Bold', 'https://example.org/'], ['italic', 'https://example.org/'],
    ['https://example.net', 'https://example.net/'], ['reader@example.com', 'mailto:reader@example.com'],
    ['https://example.com/path', 'https://example.com/path'], ['https://example.org/guide', 'https://example.org/guide'],
    ['quoted link', 'https://example.com/quote'], ['list link', 'https://example.com/list'],
    ['Grouped link', 'https://example.com/group'], ['Same-line link', 'https://example.com/inline']
  ];
  let requestId = 0;
  async function click(label: string, control: boolean, fraction = 0.5, line?: number, key?: string) {
    const path = join(process.env.MIC_NAVIGATION_BRIDGE!, 'acks', `${++requestId}.json`);
    await writeFile(join(process.env.MIC_NAVIGATION_BRIDGE!, 'requests', `${requestId}.json`), JSON.stringify({ label, control, fraction, line, key }));
    await until(async () => { try { const result = JSON.parse(await readFile(path, 'utf8')); if (result.error) throw new Error(result.error); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return false; throw error; } }, 'mouse acknowledgement');
  }
  if (process.env.MIC_NAVIGATION_EXTERNAL === '1') {
    // This resource belongs to the runner's isolated profile, never the user's.
    await vscode.workspace.fs.writeFile(vscode.Uri.parse('trustedDomains:/Trusted Domains'), Buffer.from('["https://example.com", "https://example.net"]'));
    let lostFocus = false;
    const focusChanges = vscode.window.onDidChangeWindowState(state => { if (!state.focused) lostFocus = true; });
    for (const label of ['Readable label', 'https://example.net', 'Readable label']) {
      await click('', false, 0.5, 26);
      await until(() => editor.selection.active.line === 25, 'outside click before external navigation');
      const origin = editor.selection;
      const before = api.openedLinks.length;
      const settledBefore = api.linkOpenResults.length;
      await click(label, true);
      await until(() => api.openedLinks.length === before + 1, 'real external opener');
      await until(() => api.linkOpenResults.length === settledBefore + 1, 'real external opener completes');
      assert.equal(api.linkOpenResults.at(-1)!.result, true);
      await new Promise(resolve => setTimeout(resolve, 700));
      assert.ok(api.snapshot(editor)!.ranges.some(value => value.style === 'link' && value.start <= document.getText().indexOf(label) && value.end > document.getText().indexOf(label)), 'Comment must remain rendered while browser has focus');
      await vscode.commands.executeCommand('workbench.action.focusWindow');
      await until(() => vscode.window.state.focused, 'return focus to Code');
      await new Promise(resolve => setTimeout(resolve, 700));
      assert.ok(editor.selection.isEqual(origin), 'Real external navigation must preserve the source cursor');
      assert.ok(api.snapshot(editor)!.ranges.some(value => value.style === 'link' && value.start <= document.getText().indexOf(label) && value.end > document.getText().indexOf(label)), 'Comment must remain rendered after browser return');
      console.log(`PASS real browser opening/return: ${label}`);
    }
    focusChanges.dispose();
    assert.ok(lostFocus, 'At least one real browser focus transition must be exercised');
    assert.equal(document.isDirty, false);
    console.log(`PASS real browser navigation sequence on VS Code ${vscode.version}`);
    return;
  }
  for (const fraction of [0.1, 0.5, 0.9]) {
  await click('', false, 0.5, 26);
  await until(() => editor.selection.active.line === 25, 'click outside comments on line 26');
  for (const [label, expected] of cases) {
    const before = api.openedLinks.length;
    const origin = editor.selection;
    const labelOffset = document.getText().indexOf(label);
    let revealedDuringActivation = false;
    const watchPresentation = api.onDidApply(changed => {
      if (changed === editor && !api.snapshot(editor)?.ranges.some(value => value.style === 'link' && value.start <= labelOffset && value.end > labelOffset)) revealedDuringActivation = true;
    });
    await click(label, true, fraction);
    try { await until(() => api.openedLinks.length === before + 1, `Ctrl+click ${label}`); }
    catch (error) {
      const offset = document.offsetAt(editor.selection.active);
      console.log(JSON.stringify({ label, offset, surrounding: document.getText().slice(Math.max(0, offset - 25), offset + 40), renderedLinks: api.snapshot(editor)?.ranges.filter(value => value.style === 'link'), provided: await vscode.commands.executeCommand('vscode.executeLinkProvider', document.uri) }));
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    watchPresentation.dispose();
    assert.equal(revealedDuringActivation, false, `Ctrl+click ${label} briefly revealed source`);
    assert.equal(api.openedLinks.length, before + 1, `Ctrl+click ${label} must open exactly once`);
    assert.equal(api.openedLinks.at(-1), expected, `Ctrl+click ${label} opened the wrong target`);
    assert.ok(editor.selection.isEqual(origin), `Ctrl+click ${label} moved the source selection: expected ${document.offsetAt(origin.active)}, actual ${document.offsetAt(editor.selection.active)}`);
    assert.ok(api.snapshot(editor)!.ranges.some(value => value.style === 'link' && value.start <= labelOffset && value.end > labelOffset), `Ctrl+click ${label} revealed source`);
    console.log(`PASS Ctrl+click ${label} at ${fraction}: ${api.openedLinks.at(-1)}`);
  }
  }
  // Exercise real local navigation, including the replacement editor on return.
  const localOrigin = editor.selection;
  await click('Local fixture', true);
  await until(() => vscode.window.activeTextEditor?.document.uri.path.endsWith('/unordered-lists.ts') === true, 'local target opens');
  editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One });
  await until(() => !!api.snapshot(editor)?.ranges.some(value => value.style === 'link' && value.start === document.getText().indexOf('Local fixture')), 'local return remains rendered');
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.ok(editor.selection.isEqual(localOrigin), 'Local return preserves source cursor');
  assert.ok(api.snapshot(editor)!.ranges.some(value => value.style === 'link' && value.start === document.getText().indexOf('Local fixture')), 'Local return stays rendered after selection events settle');
  console.log('PASS actual local file opening and source-tab return');
  const before = api.openedLinks.length;
  const originBeforePlain = editor.selection;
  await click('Readable label', false);
  await until(() => !api.snapshot(editor)!.ranges.some(value => value.style === 'link' && value.start === document.getText().indexOf('Readable label')), 'ordinary click source reveal');
  assert.equal(api.openedLinks.length, before);
  assert.equal(document.isDirty, false);
  // A confirmation/cold command dispatch can outlast the 200 ms reveal timer.
  // Late activation must still recover the origin of that same mouse click.
  await new Promise(resolve => setTimeout(resolve, 700));
  await vscode.commands.executeCommand('markdownInCode.followLink', document.uri.toString(), 'https://example.com');
  await until(() => !!api.snapshot(editor)!.ranges.some(value => value.style === 'link' && value.start === document.getText().indexOf('Readable label')), 'delayed activation restores rendering');
  assert.ok(editor.selection.isEqual(originBeforePlain), 'Delayed activation must restore the original cursor');
  assert.equal(api.openedLinks.length, before + 1);
  console.log('PASS delayed activation restores source after the reveal timer expires');
  const labelPosition = document.positionAt(document.getText().indexOf('Readable label'));
  editor.selection = new vscode.Selection(labelPosition, labelPosition);
  await until(() => !api.snapshot(editor)!.ranges.some(value => value.style === 'link' && value.start === document.getText().indexOf('Readable label')), 'intentional command navigation reveals source');
  await vscode.commands.executeCommand('markdownInCode.followLink', document.uri.toString(), 'https://example.com');
  await until(() => !!api.snapshot(editor)!.ranges.some(value => value.style === 'link' && value.start === document.getText().indexOf('Readable label')), 'link navigation explicitly leaves comment rendered');
  const original = document.getText();
  await editor.edit(edit => edit.replace(new vscode.Range(labelPosition, labelPosition.translate(0, 'Readable label'.length)), 'Edited label'));
  await until(() => api.snapshot(editor)!.version === document.version && !api.snapshot(editor)!.ranges.some(value => value.style === 'link' && value.start === document.getText().indexOf('Edited label')), 'editing clears navigation presentation');
  assert.equal(document.getText(), original.replace('Readable label', 'Edited label'));
  console.log('PASS explicit navigation and editing release navigation presentation');
  await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  await vscode.commands.executeCommand('notifications.clearAll');
  await vscode.workspace.getConfiguration('editor').update('find.seedSearchStringFromSelection', 'never', vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand('actions.find');
  await new Promise(resolve => setTimeout(resolve, 300));
  await click('', false, 0.5, undefined, 'Escape');
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.ok(!api.snapshot(editor)!.ranges.some(value => value.style === 'link' && value.start === document.getText().indexOf('Edited label')), 'First Escape must close Find without rendering the comment');
  const escapeCursor = editor.selection;
  assert.ok(escapeCursor.isEmpty, `Find setup must leave an empty caret: ${JSON.stringify(escapeCursor)}`);
  const escapeTop = editor.visibleRanges[0].start.line;
  await click('', false, 0.5, undefined, 'Escape');
  await until(() => !!api.snapshot(editor)!.ranges.some(value => value.style === 'link' && value.start === document.getText().indexOf('Edited label')), 'physical Escape renders comment');
  assert.ok(editor.selection.isEqual(escapeCursor));
  assert.equal(editor.visibleRanges[0].start.line, escapeTop);
  await click('Edited label', false);
  await until(() => !api.snapshot(editor)!.ranges.some(value => value.style === 'link' && value.start === document.getText().indexOf('Edited label')), 'ordinary click releases Escape presentation');
  await click('', false, 0.5, undefined, 'Escape');
  await until(() => !!api.snapshot(editor)!.ranges.some(value => value.style === 'link' && value.start === document.getText().indexOf('Edited label')), 'second physical Escape renders comment');
  await click('', false, 0.5, undefined, 'ArrowRight');
  await until(() => !api.snapshot(editor)!.ranges.some(value => value.style === 'link' && value.start === document.getText().indexOf('Edited label')), 'physical arrow resumes source editing');
  assert.equal(document.getText(), original.replace('Readable label', 'Edited label'));
  console.log('PASS physical Escape respects Find, preserves cursor/viewport, and releases on click/arrow');
  const viewportSettings = vscode.workspace.getConfiguration('editor');
  for (const [key, value] of Object.entries({ fontSize: 16, lineHeight: 24, wordWrap: 'on', 'minimap.enabled': true })) {
    await viewportSettings.update(key, value, vscode.ConfigurationTarget.Global);
  }
  const viewportDocument = await vscode.workspace.openTextDocument(join(vscode.workspace.workspaceFolders![0].uri.fsPath, 'headings-wrap.ts'));
  const viewportSource = viewportDocument.getText();
  const firstViewport = await vscode.window.showTextDocument(viewportDocument, { viewColumn: vscode.ViewColumn.One, preview: false });
  firstViewport.selection = new vscode.Selection(0, 0, 0, 0);
  await until(() => !!api.snapshot(firstViewport)?.ranges.some(value => value.style === 'codeFence'), 'first viewport fence');
  await click('__fence_viewport__', false, 1);
  const secondViewport = await vscode.window.showTextDocument(viewportDocument, { viewColumn: vscode.ViewColumn.Two, preview: false });
  secondViewport.selection = new vscode.Selection(0, 0, 0, 0);
  await vscode.commands.executeCommand('workbench.action.increaseViewSize');
  await vscode.commands.executeCommand('workbench.action.increaseViewSize');
  await until(() => !!api.snapshot(secondViewport)?.ranges.some(value => value.style === 'codeFence'), 'second viewport fence');
  await click('__fence_viewport__', false, 2);
  assert.equal(viewportDocument.getText(), viewportSource);
  console.log(`PASS ordinary click reveals source without opening; native mouse checks passed on VS Code ${vscode.version}`);
}
