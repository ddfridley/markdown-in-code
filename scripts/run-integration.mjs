import { runTests } from '@vscode/test-electron';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const session = resolve(root, '.vscode-test', 'sessions', `${Date.now()}`);
const workspace = resolve(session, 'workspace');
mkdirSync(workspace, { recursive: true });
// Never inherit the CLI's Electron-as-Node flag into the test application.
delete process.env.ELECTRON_RUN_AS_NODE;
console.log(`Integration session: ${session}`);
await runTests({
  version: '1.100.3',
  ...(process.env.VSCODE_EXECUTABLE_PATH ? { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH } : {}),
  extensionDevelopmentPath: root,
  extensionTestsPath: resolve(root, 'dist/integration/index.cjs'),
  launchArgs: [workspace, '--new-window', '--disable-extensions', '--disable-workspace-trust',
    '--skip-welcome', '--skip-release-notes', '--user-data-dir', resolve(session, 'user-data'),
    '--extensions-dir', resolve(session, 'extensions')],
});
