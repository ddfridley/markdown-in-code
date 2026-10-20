import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = resolve(root, '.vscode-test/visual-artifacts');
const preflight = spawnSync(process.execPath, ['scripts/run-visual-docker.mjs'], { cwd: root, stdio: 'inherit' });
if (preflight.error) throw preflight.error;
if (preflight.status !== 0) throw new Error('Mutation checks require a clean comparison against human-accepted images. Review pending changes first; existing visual differences must not count as mutation detection.');
for (const mutation of ['missing-border', 'offset', 'heading-size']) {
  const before = new Set(await readdir(artifacts));
  const run = spawnSync(process.execPath, ['scripts/run-visual-docker.mjs', `--mutation=${mutation}`], { cwd: root, stdio: 'inherit' });
  if (run.error) throw run.error;
  if (run.status !== 1) throw new Error(`Expected the ${mutation} comparison to fail, got ${run.status}`);
  const created = (await readdir(artifacts)).filter(name => !before.has(name) && name.endsWith('-mutation'));
  if (created.length !== 1) throw new Error('Expected exactly one mutation artifact directory');
  const report = JSON.parse(await readFile(resolve(artifacts, created[0], 'report.json'), 'utf8'));
  if (report.failure || report.reports.length !== 23 || report.mutation !== mutation || !report.reports.some(result => result.pixels > 0 && !result.pass)) {
    throw new Error(`Mutation did not fail through an actual pixel comparison: ${JSON.stringify(report)}`);
  }
  console.log(`PASS: ${mutation} was rejected with reviewable pixel diffs.`);
}
