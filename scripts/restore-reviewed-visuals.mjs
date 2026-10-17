// One-time migration from automatic updates to the human-review gate.
// The user reviewed these images before commit 08c5b70. Preserve every newer
// image as preliminary; do not treat generated heading images as accepted.
import { execFileSync } from 'node:child_process';
import { access, mkdir, readdir, rename, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './visual/review.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(root, 'tests/visual/baselines');
try { await access(join(directory, 'accepted.json')); throw new Error('Acceptance manifest already exists; migration cannot run again'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const commit = execFileSync('git', ['rev-parse', '08c5b70'], { cwd: root, encoding: 'utf8' }).trim();
const prefix = 'tests/visual/baselines/';
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, prefix], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(file => file.endsWith('.png') || file.endsWith('/environment.json'));
const originals = files.map(file => ({ name: file.slice(prefix.length), bytes: execFileSync('git', ['show', `${commit}:${file}`], { cwd: root, maxBuffer: 10 * 1024 * 1024 }) }));
const preserved = resolve(root, 'tests/visual/preliminary', `before-review-gate-${Date.now()}`);
await mkdir(preserved, { recursive: true });
for (const file of await readdir(directory)) if (file.endsWith('.png')) await rename(join(directory, file), join(preserved, file.replace('.png', '.actual.png')));
for (const file of originals) await writeFile(join(directory, file.name), file.bytes);
const images = Object.fromEntries(originals.filter(file => file.name.endsWith('.png')).map(file => [file.name.slice(0, -4), sha256(file.bytes)]));
const metadataSha256 = sha256(await readFile(join(directory, 'environment.json')));
await writeFile(join(directory, 'accepted.json'), JSON.stringify({ version: 1, metadataSha256, images,
  approvals: [{ sourceCommit: commit, reviewedBy: 'user', reviewedOn: '2026-10-17', metadataSha256, images, cases: Object.keys(images), note: 'Migration of the committed, user-reviewed fenced-code and horizontal-rule baseline. No heading previews accepted.' }] }, null, 2) + '\n');
console.log(`Restored ${Object.keys(images).length} reviewed baselines from ${commit}. Newer images preserved at ${preserved}.`);
