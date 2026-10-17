import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = resolve(root, 'tests/visual/baselines');
const artifacts = resolve(root, '.vscode-test/visual-artifacts');
const preliminary = resolve(root, 'tests/visual/preliminary');
if (process.argv.includes('--update')) throw new Error('Baseline updates require human review. Use visual:capture:docker, review index.html, then visual:accept.');
mkdirSync(baseline, { recursive: true });
mkdirSync(artifacts, { recursive: true });
mkdirSync(preliminary, { recursive: true });
function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
const build = docker(['build', '--platform', 'linux/amd64', '-f', 'tests/visual/Dockerfile', '-t', 'markdown-in-code-visual', '.']);
if (build !== 0) process.exit(build);
const before = new Set(readdirSync(preliminary));
const status = docker(['run', '--rm', '--init', '--platform', 'linux/amd64', '--shm-size=1g',
  '--mount', `type=bind,source=${baseline},target=/app/tests/visual/baselines,readonly`,
  '--mount', `type=bind,source=${preliminary},target=/app/tests/visual/preliminary`,
  '--mount', `type=bind,source=${artifacts},target=/app/.vscode-test/visual-artifacts`,
  'markdown-in-code-visual', ...process.argv.slice(2)]);
for (const run of readdirSync(preliminary).filter(name => !before.has(name) && /^\d+$/.test(name))) {
  const page = resolve(preliminary, run, 'index.html');
  if (existsSync(page)) {
    writeFileSync(resolve(preliminary, 'latest.html'), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${run}/index.html"><a href="${run}/index.html">Open latest screenshot review</a>\n`);
    console.log(`Review on this computer: ${page}`);
  }
}
process.exit(status);
