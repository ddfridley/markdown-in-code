import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(root, '.vscode-test/heading-contract-mutations', `${Date.now()}`);
await mkdir(join(directory, 'src'), { recursive: true });
await mkdir(join(directory, 'tests/contracts'), { recursive: true });
const source = await readFile(resolve(root, 'src/headings.ts'), 'utf8');
const mutated = source.replace('[1.64, 1.37, 1.09, 1.04, 0.98, 0.93]', '[1, 1, 1.09, 1.04, 0.98, 0.93]');
if (mutated === source) throw new Error('Unable to introduce the intended heading-size regression');
await writeFile(join(directory, 'src/headings.ts'), mutated);
await copyFile(resolve(root, 'tests/heading-contract.test.ts'), join(directory, 'tests/heading-contract.test.ts'));
await copyFile(resolve(root, 'tests/contracts/headings.json'), join(directory, 'tests/contracts/headings.json'));
const output = join(directory, 'report.json');
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', '--root', directory, '--reporter=json', '--outputFile', output], { cwd: root, encoding: 'utf8' });
await writeFile(join(directory, 'test.log'), `${result.stdout}\n${result.stderr}`);
if (result.error) throw result.error;
const report = JSON.parse(await readFile(output, 'utf8'));
// Vitest's JSON reporter can abbreviate array values instead of including the
// percentage strings. Require the actual size assertion to fail, not wording
// from a particular reporter version or an unrelated test-loading error.
const sizeFailure = report.testResults.flatMap(test => test.assertionResults ?? []).some(assertion =>
  assertion.status === 'failed' && assertion.title === 'retains full relative sizes and weights under default and tight row heights' &&
  assertion.failureMessages.some(message => message.includes('AssertionError') && message.includes('deeply equal') && /heading-contract\.test\.ts:\d+:/.test(message)));
if (result.status !== 1 || report.numFailedTests !== 1 || !sizeFailure) throw new Error(`Regression did not fail the heading contract: inspect ${directory}`);
console.log(`PASS: flattening H1/H2 to 100% failed the unchanged heading contract. Production source and accepted contract were untouched. Evidence: ${directory}`);
