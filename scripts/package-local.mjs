import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { isBuiltin } from 'node:module';
import { spawnSync } from 'node:child_process';

// The bundle is self-contained apart from VS Code and Node built-ins. TypeScript
// additionally probes source-map-support inside try/catch for optional debugging;
// the shipped parser does not require that hook or source maps to operate.
// Generate notices from actual bundled inputs so packaging cannot omit transitive licenses.
const metadata = JSON.parse(await readFile('dist/extension-meta.json', 'utf8'));
for (const output of Object.values(metadata.outputs)) for (const dependency of output.imports ?? []) {
  if (dependency.external && dependency.path !== 'vscode' && dependency.path !== 'source-map-support' && !isBuiltin(dependency.path)) {
    throw new Error(`Unbundled runtime dependency: ${dependency.path}`);
  }
}
const packages = new Map();
for (const input of Object.keys(metadata.inputs)) {
  if (!input.startsWith('node_modules/')) continue;
  let directory = dirname(resolve(input));
  while (directory !== dirname(directory)) {
    try { await access(join(directory, 'package.json')); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; directory = dirname(directory); }
  }
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const identity = `${manifest.name}@${manifest.version}`;
  if (packages.has(identity)) continue;
  const licenses = (await readdir(directory)).filter(name => /^(?:licen[cs]e(?:[._-].*)?|copying(?:[._-].*)?|notice(?:[._-].*)?|thirdpartynotice.*)$/i.test(name));
  if (!licenses.length) throw new Error(`No license text found for bundled package ${identity}`);
  packages.set(identity, [identity, `Declared license: ${manifest.license ?? 'see texts below'}`,
    ...(await Promise.all(licenses.sort().map(async name => `\n${name}\n${await readFile(join(directory, name), 'utf8')}`)))].join('\n'));
}
await writeFile('dist/THIRD_PARTY_NOTICES.txt', 'Bundled third-party software notices\n\n' +
  [...packages].sort(([a], [b]) => a.localeCompare(b)).map(([, text]) => text).join('\n\n' + '='.repeat(72) + '\n\n'));
console.log(`Included license notices for ${packages.size} bundled packages.`);
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const artifact = `${manifest.name}-${manifest.version}.vsix`;
const result = spawnSync(process.execPath, ['node_modules/@vscode/vsce/vsce', 'package', '--no-dependencies',
  '--allow-missing-repository', '--no-rewrite-relative-links', '--out', artifact], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Local test package: ${artifact}; extension ID: ${manifest.publisher}.${manifest.name}`);
