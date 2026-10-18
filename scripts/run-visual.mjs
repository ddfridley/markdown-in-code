import { runTests } from '@vscode/test-electron';
import { mkdir, readFile, writeFile, copyFile, cp, readdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { connect, captureEditor } from './visual/cdp.mjs';
import { compareFiles } from './visual/compare.mjs';
import { verifyAccepted, sha256, writeReview } from './visual/review.mjs';

const environment = 'debian-bookworm-20250615-node22.16-vscode1.100.3-x64';
if (process.platform !== 'linux' || process.arch !== 'x64' || process.env.MIC_VISUAL_ENVIRONMENT !== environment) {
  throw new Error('Visual comparisons and updates must run through the pinned Docker image. Use npm run test:visual:docker.');
}
if (process.argv.includes('--update')) throw new Error('Automatic baseline updates are disabled. Capture, review index.html, then use visual:accept interactively.');
const mutation = process.argv.find(argument => argument.startsWith('--mutation='))?.slice(11);
if (mutation && !['missing-border', 'offset', 'heading-size'].includes(mutation)) throw new Error('Unknown visual mutation');
const names = new Set(['block-light', 'block-selected-light', 'block-narrow-light', 'block-dark', 'standalone-light', 'horizontal-rules-light', 'fenced-light', 'fenced-sidebar-light', 'fenced-minimap-light', 'fenced-dark', 'headings-light', 'headings-narrow-light', 'headings-tight-light', 'headings-wrapped-light', 'headings-dark', 'unordered-lists-light', 'unordered-lists-dark']);
const root = fileURLToPath(new URL('../', import.meta.url));
const runId = `${Date.now()}`;
const artifact = mutation ? resolve(root, '.vscode-test/visual-artifacts', `${runId}-mutation`) : resolve(root, 'tests/visual/preliminary', runId);
const session = resolve(root, '.vscode-test/visual-session');
const bridge = join(session, 'bridge');
const baseline = resolve(root, 'tests/visual/baselines');
for (const directory of [artifact, baseline, join(session, 'workspace'), join(session, 'user-data/User'), join(bridge, 'requests'), join(bridge, 'acks')]) await mkdir(directory, { recursive: true });
await cp(resolve(root, 'tests/visual/fixtures'), join(session, 'workspace'), { recursive: true });
await copyFile(resolve(root, 'tests/visual/settings.json'), join(session, 'user-data/User/settings.json'));
const metadata = { environment, vscode: '1.100.3', node: process.version, font: 'DejaVu Sans Mono', fontSize: 16, lineHeight: 24, scale: 1, capture: 'editor-excluding-scrollbar-and-overview-ruler', pixelThreshold: 0.1, allowedDifferingPixels: 0 };
const accepted = await verifyAccepted(baseline);
{
  const recorded = JSON.parse(await readFile(join(baseline, 'environment.json'), 'utf8'));
  if (JSON.stringify(recorded) !== JSON.stringify(metadata)) throw new Error('Visual environment differs from approved metadata; do not update automatically.');
}
const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolvePort(port)); });
});
let cdp;
let queue = Promise.resolve();
const seen = new Set();
const reports = [];
async function scan() {
  for (const file of await readdir(join(bridge, 'requests'))) {
    if (!file.endsWith('.json') || seen.has(file)) continue;
    let request;
    try { request = JSON.parse(await readFile(join(bridge, 'requests', file), 'utf8')); } catch { continue; }
    if (seen.has(file)) continue;
    seen.add(file);
    queue = queue.then(async () => {
      try {
        if (!names.has(request.name) || ![850, 1200].includes(request.width)) throw new Error('Unexpected capture request');
        cdp ??= await connect(port);
        if (request.theme !== (request.name.endsWith('-dark') ? 'dark' : 'light')) throw new Error('Unexpected capture theme');
        const actual = join(artifact, `${request.name}.actual.png`);
        await writeFile(actual, await captureEditor(cdp, request.width, mutation, request.theme));
        const expected = join(baseline, `${request.name}.png`);
        const report = await compareFiles(expected, actual, join(artifact, `${request.name}.diff.png`), join(artifact, `${request.name}.expected.png`));
        reports.push({ name: request.name, ...report, candidateSha256: sha256(await readFile(actual)), acceptedSha256: accepted.manifest.images[request.name] ?? null });
        console.log(`${report.pass ? 'PASS' : 'FAIL'} ${request.name}: ${report.reason}`);
        await writeFile(join(bridge, 'acks', file), '{}');
      } catch (error) {
        reports.push({ name: request.name, pass: false, reason: String(error) });
        await writeFile(join(bridge, 'acks', file), JSON.stringify({ error: String(error) }));
      }
    });
  }
}
const watcher = watch(join(bridge, 'requests'), () => { void scan(); });
delete process.env.ELECTRON_RUN_AS_NODE;
console.log(`Visual artifacts: ${artifact}`);
let failure;
try {
  await runTests({ version: '1.100.3', extensionDevelopmentPath: root, extensionTestsPath: resolve(root, 'dist/visual/index.cjs'),
    extensionTestsEnv: { MIC_VISUAL_BRIDGE: bridge },
    launchArgs: [join(session, 'workspace'), '--no-sandbox', '--disable-gpu', '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
      `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', '--force-device-scale-factor=1',
      '--user-data-dir', join(session, 'user-data'), '--extensions-dir', join(session, 'extensions')] });
} catch (error) { failure = String(error); }
finally {
  watcher.close(); await queue; cdp?.close();
  try {
    if ((await verifyAccepted(baseline)).hash !== accepted.hash) failure = 'Accepted baselines changed during capture; rerun against a stable accepted set';
  } catch (error) { failure = `Accepted baseline integrity failed during capture: ${error}`; }
  await cp(join(session, 'user-data/logs'), join(artifact, 'logs'), { recursive: true }).catch(() => {});
  const report = { runId, metadata, metadataSha256: sha256(await readFile(join(baseline, 'environment.json'))), acceptedManifestSha256: accepted.hash, cases: [...names], mutation, failure, reports };
  await writeFile(join(artifact, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeReview(artifact, report);
  console.log(`Review accepted / preliminary / differences: ${artifact}/index.html`);
}
if (failure || reports.length !== names.size || reports.some(report => !report.pass)) {
  throw new Error(`Visual run failed; inspect ${artifact}/report.json${failure ? `: ${failure}` : ''}`);
}
console.log(`${reports.length} visual cases match accepted baselines.`);
