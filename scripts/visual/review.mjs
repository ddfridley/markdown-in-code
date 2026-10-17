import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
const validName = name => typeof name === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);

export async function verifyAccepted(directory) {
  const raw = await readFile(join(directory, 'accepted.json'));
  const manifest = JSON.parse(raw);
  if (manifest.version !== 1 || !manifest.images || !Array.isArray(manifest.approvals)) throw new Error('Invalid acceptance manifest');
  if (sha256(await readFile(join(directory, 'environment.json'))) !== manifest.metadataSha256) throw new Error('Accepted environment metadata was changed without acceptance');
  for (const [name, hash] of Object.entries(manifest.images)) {
    const approval = [...manifest.approvals].reverse().find(value => Array.isArray(value.cases) && value.cases.includes(name));
    if (!approval?.reviewedBy?.trim() || approval.images?.[name] !== hash || approval.metadataSha256 !== manifest.metadataSha256) throw new Error(`Missing human acceptance record: ${name}`);
    if (!validName(name) || sha256(await readFile(join(directory, `${name}.png`))) !== hash) throw new Error(`Accepted image changed without acceptance: ${name}`);
  }
  for (const file of await readdir(directory)) {
    if (file.endsWith('.png') && !manifest.images[file.slice(0, -4)]) throw new Error(`Unaccepted image in accepted directory: ${file}`);
  }
  return { manifest, hash: sha256(raw) };
}

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
export async function writeReview(directory, report) {
  const cards = report.reports.map(item => {
    const name = escape(item.name);
    const picture = (suffix, title, present = true) => `<div><h3>${title}</h3>${present ? `<a href="${name}.${suffix}.png"><img src="${name}.${suffix}.png" alt="${title}: ${name}"></a>` : '<p>No accepted image: new case.</p>'}</div>`;
    return `<section><h2>${item.pass ? 'UNCHANGED' : 'REVIEW REQUIRED'}: ${name}</h2><p>${escape(item.reason)}</p><div class="images">${picture('expected', 'Accepted', !!item.acceptedSha256)}${picture('actual', 'Preliminary')}${item.pixels > 0 || item.reason.startsWith('Dimensions:') ? picture('diff', 'Difference') : ''}</div></section>`;
  }).join('\n');
  await writeFile(join(directory, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Screenshot review</title><style>body{font:16px system-ui;margin:24px;background:#eee;color:#222}section{background:white;padding:16px;margin:20px 0;border:1px solid #aaa}.images{display:flex;gap:12px}.images>div{flex:1;min-width:0}img{max-width:100%;border:1px solid #aaa}a{color:#0645ad}</style></head><body><h1>Screenshot review: ${escape(report.runId)}</h1><p>Accepted images are unchanged. Preliminary images are NOT approved. Click an image for full resolution. Review every changed/new case before accepting this exact run.</p><p>${report.reports.filter(item => !item.pass).length} cases require review. <a href="report.json">Machine-readable report and hashes</a></p>${cards}</body></html>\n`);
}

export async function acceptReviewedRun(directory, acceptedDirectory, reviewer) {
  if (!reviewer?.trim()) throw new Error('A human reviewer name is required');
  const report = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'));
  if (report.mutation || report.failure || !Array.isArray(report.cases) || !report.cases.length || report.reports.length !== report.cases.length || new Set(report.cases).size !== report.cases.length) throw new Error('Only complete, unmutated capture runs can be accepted');
  const accepted = await verifyAccepted(acceptedDirectory);
  if (accepted.hash !== report.acceptedManifestSha256) throw new Error('Accepted baselines changed since this review run; capture again');
  const metadata = await readFile(join(acceptedDirectory, 'environment.json'));
  if (report.metadataSha256 !== sha256(metadata)) throw new Error('Capture environment differs from accepted environment');
  const images = [];
  for (const name of report.cases) {
    if (!validName(name)) throw new Error('Invalid capture name');
    const matches = report.reports.filter(item => item.name === name);
    if (matches.length !== 1 || matches[0].acceptedSha256 !== (accepted.manifest.images[name] ?? null)) throw new Error('Invalid or stale accepted-image reference');
    const bytes = await readFile(join(directory, `${name}.actual.png`));
    if (sha256(bytes) !== matches[0].candidateSha256) throw new Error(`Preliminary image changed after capture: ${name}`);
    images.push({ name, bytes, hash: matches[0].candidateSha256 });
  }
  // Validate the entire run before writing anything. An interrupted write leaves
  // an integrity failure, never an unnoticed change to the accepted baseline.
  for (const image of images) await writeFile(join(acceptedDirectory, `${image.name}.png`), image.bytes);
  const manifest = { ...accepted.manifest, images: { ...accepted.manifest.images, ...Object.fromEntries(images.map(image => [image.name, image.hash])) },
    approvals: [...accepted.manifest.approvals, { runId: report.runId, reviewedBy: reviewer.trim(), acceptedAt: new Date().toISOString(), metadataSha256: accepted.manifest.metadataSha256, images: Object.fromEntries(images.map(image => [image.name, image.hash])), cases: images.map(image => image.name) }] };
  await writeFile(join(acceptedDirectory, 'accepted.json'), JSON.stringify(manifest, null, 2) + '\n');
  return images.length;
}
