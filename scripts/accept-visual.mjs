import { createInterface } from 'node:readline/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptReviewedRun } from './visual/review.mjs';

if (process.env.CI || !process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Acceptance requires an interactive human review; unavailable in CI/noninteractive tasks');
const root = fileURLToPath(new URL('../', import.meta.url));
const runId = process.argv[2];
if (!runId || !/^\d+$/.test(runId)) throw new Error('Usage: npm run visual:accept -- <run-id>');
const directory = resolve(root, 'tests/visual/preliminary', runId);
const path = relative(resolve(root, 'tests/visual/preliminary'), directory);
if (path.startsWith('..') || isAbsolute(path)) throw new Error('Invalid review path');
const prompt = createInterface({ input: process.stdin, output: process.stdout });
try {
  console.log(`Review accepted/preliminary/diff images first: ${directory}/index.html`);
  const reviewer = await prompt.question('Your reviewer name: ');
  const confirmation = await prompt.question(`After inspecting ALL changed/new images, type ACCEPT ${runId}: `);
  if (confirmation !== `ACCEPT ${runId}`) throw new Error('Not accepted; baselines unchanged');
  console.log(`Accepted ${await acceptReviewedRun(directory, resolve(root, 'tests/visual/baselines'), reviewer)} images. Rerun npm run test:visual:docker, then commit accepted images and accepted.json.`);
} finally { prompt.close(); }
