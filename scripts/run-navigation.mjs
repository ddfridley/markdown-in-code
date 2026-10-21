import { runTests } from '@vscode/test-electron';
import { mkdir, cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { connect, controlClickLink, clickEditorLine } from './visual/cdp.mjs';
import { assertFenceViewport } from './visual/fence-viewport.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const session = resolve(root, '.vscode-test', 'navigation', String(Date.now()));
const workspace = join(session, 'workspace');
const bridge = join(session, 'bridge');
await mkdir(workspace, { recursive: true });
for (const name of ['requests', 'acks']) await mkdir(join(bridge, name), { recursive: true });
for (const name of ['links.ts', 'unordered-lists.ts', 'headings-wrap.ts']) await cp(join(root, 'tests/visual/fixtures', name), join(workspace, name));
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
let cdp, queue = Promise.resolve();
const seen = new Set();
async function scan() {
  for (const name of await readdir(join(bridge, 'requests'))) {
    if (!/^\d+\.json$/.test(name) || seen.has(name)) continue;
    let request;
    try { request = JSON.parse(await readFile(join(bridge, 'requests', name), 'utf8')); } catch { continue; }
    if (seen.has(name)) continue;
    seen.add(name);
    queue = queue.then(async () => {
      try {
        cdp ??= await connect(port);
        if (request.label === '__fence_viewport__') {
          if (![1, 2].includes(request.fraction)) throw new Error('Unexpected viewport editor count');
          await assertFenceViewport(cdp, request.fraction, process.env.MIC_REQUIRE_NATIVE_VIEWPORT === '1');
        } else if (request.key) {
          const keyCode = { Escape: 27, ArrowRight: 39 }[request.key];
          if (!keyCode) throw new Error('Unexpected test key');
          await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key: request.key, code: request.key, windowsVirtualKeyCode: keyCode });
          await cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key: request.key, code: request.key, windowsVirtualKeyCode: keyCode });
        } else if (request.line === 26) await clickEditorLine(cdp, request.line);
        else await controlClickLink(cdp, request.label, request.control, request.fraction ?? 0.5);
        await writeFile(join(bridge, 'acks', name), '{}');
      } catch (error) { await writeFile(join(bridge, 'acks', name), JSON.stringify({ error: String(error) })); }
    });
  }
}
const watcher = watch(join(bridge, 'requests'), () => { void scan(); });
delete process.env.ELECTRON_RUN_AS_NODE;
console.log(`Native mouse session: ${session}`);
try {
  await runTests({ version: '1.100.3',
    ...(process.env.VSCODE_EXECUTABLE_PATH ? { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH } : {}),
    extensionDevelopmentPath: root, extensionTestsPath: join(root, 'dist/navigation/index.cjs'),
    extensionTestsEnv: { MIC_NAVIGATION_BRIDGE: bridge, MIC_CAPTURE_LINKS: process.env.MIC_NAVIGATION_EXTERNAL === '1' ? '0' : '1', MIC_NAVIGATION_EXTERNAL: process.env.MIC_NAVIGATION_EXTERNAL ?? '0' },
    launchArgs: [workspace, '--new-window', '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
      '--disable-gpu', `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
      '--user-data-dir', join(session, 'user-data'), '--extensions-dir', join(session, 'extensions')] });
} finally { watcher.close(); await queue; cdp?.close(); }
