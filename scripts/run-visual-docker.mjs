import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = resolve(root, 'tests/visual/baselines');
const artifacts = resolve(root, '.vscode-test/visual-artifacts');
mkdirSync(baseline, { recursive: true });
mkdirSync(artifacts, { recursive: true });
function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
docker(['build', '--platform', 'linux/amd64', '-f', 'tests/visual/Dockerfile', '-t', 'markdown-in-code-visual', '.']);
docker(['run', '--rm', '--init', '--platform', 'linux/amd64', '--shm-size=1g',
  '--mount', `type=bind,source=${baseline},target=/app/tests/visual/baselines${process.argv.includes('--update') ? '' : ',readonly'}`,
  '--mount', `type=bind,source=${artifacts},target=/app/.vscode-test/visual-artifacts`,
  'markdown-in-code-visual', ...process.argv.slice(2)]);
