import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { sha256, verifyAccepted, acceptReviewedRun, writeReview } from '../scripts/visual/review.mjs';

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'mic-review-'));
  try {
    const accepted = join(root, 'accepted'), preliminary = join(root, 'preliminary');
    await mkdir(accepted); await mkdir(preliminary);
    const old = Buffer.from('accepted pixels'), candidate = Buffer.from('changed pixels'), metadata = Buffer.from('{}\n');
    await writeFile(join(accepted, 'sample.png'), old);
    await writeFile(join(accepted, 'environment.json'), metadata);
    await writeFile(join(accepted, 'accepted.json'), JSON.stringify({ version: 1, metadataSha256: sha256(metadata), images: { sample: sha256(old) }, approvals: [{ reviewedBy: 'Original human reviewer', metadataSha256: sha256(metadata), images: { sample: sha256(old) }, cases: ['sample'] }] }));
    const report = { runId: '123', cases: ['sample'], metadataSha256: sha256(metadata), acceptedManifestSha256: (await verifyAccepted(accepted)).hash,
      reports: [{ name: 'sample', pass: false, reason: '10 differing pixels', pixels: 10, acceptedSha256: sha256(old), candidateSha256: sha256(candidate) }] };
    await writeFile(join(preliminary, 'sample.actual.png'), candidate);
    await writeFile(join(preliminary, 'report.json'), JSON.stringify(report));
    await run({ accepted, preliminary, old, candidate, report });
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe('human screenshot acceptance', () => {
  it('shows changed and new cases before unchanged cases without reordering the report', async () => fixture(async ({ preliminary, report }) => {
    report.reports = [
      { ...report.reports[0], name: 'unchanged', pass: true },
      { ...report.reports[0], name: 'changed' },
      { ...report.reports[0], name: 'new-case', acceptedSha256: null }
    ];
    await writeReview(preliminary, report);
    const html = await readFile(join(preliminary, 'index.html'), 'utf8');
    expect(html.indexOf('REVIEW REQUIRED: changed')).toBeLessThan(html.indexOf('REVIEW REQUIRED: new-case'));
    expect(html.indexOf('REVIEW REQUIRED: new-case')).toBeLessThan(html.indexOf('UNCHANGED: unchanged'));
    expect(report.reports.map(item => item.name)).toEqual(['unchanged', 'changed', 'new-case']);
  }));
  it('refuses unattended acceptance and the former automatic update command', () => {
    const accept = spawnSync(process.execPath, ['scripts/accept-visual.mjs', '123'], { encoding: 'utf8', env: { ...process.env, CI: 'true' } });
    expect(accept.status).not.toBe(0);
    expect(accept.stderr).toContain('interactive human review');
    const update = spawnSync(process.execPath, ['scripts/run-visual-docker.mjs', '--update'], { encoding: 'utf8' });
    expect(update.status).not.toBe(0);
    expect(update.stderr).toContain('human review');
  });
  it('writes a three-way preliminary review without changing accepted images', async () => fixture(async ({ accepted, preliminary, old, report }) => {
    const before = await readFile(join(accepted, 'accepted.json'));
    await writeReview(preliminary, report);
    const html = await readFile(join(preliminary, 'index.html'), 'utf8');
    expect(html).toContain('sample.expected.png'); expect(html).toContain('sample.actual.png'); expect(html).toContain('sample.diff.png');
    expect(await readFile(join(accepted, 'sample.png'))).toEqual(old);
    expect(await readFile(join(accepted, 'accepted.json'))).toEqual(before);
  }));
  it('rejects modified accepted images', async () => fixture(async ({ accepted }) => {
    await writeFile(join(accepted, 'sample.png'), 'unexpected');
    await expect(verifyAccepted(accepted)).rejects.toThrow('without acceptance');
  }));
  it('rejects matching images without a human acceptance record', async () => fixture(async ({ accepted }) => {
    const path = join(accepted, 'accepted.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.approvals = [];
    await writeFile(path, JSON.stringify(manifest));
    await expect(verifyAccepted(accepted)).rejects.toThrow('Missing human acceptance');
  }));
  it('rejects changed preliminary images before modifying acceptance', async () => fixture(async ({ accepted, preliminary, old }) => {
    await writeFile(join(preliminary, 'sample.actual.png'), 'tampered');
    await expect(acceptReviewedRun(preliminary, accepted, 'Human reviewer')).rejects.toThrow('changed after capture');
    expect(await readFile(join(accepted, 'sample.png'))).toEqual(old);
  }));
  it('rejects modified metadata and unlisted accepted images', async () => fixture(async ({ accepted }) => {
    await writeFile(join(accepted, 'extra.png'), 'unreviewed');
    await expect(verifyAccepted(accepted)).rejects.toThrow('Unaccepted image');
    await writeFile(join(accepted, 'environment.json'), 'changed');
    await expect(verifyAccepted(accepted)).rejects.toThrow('metadata');
  }));
  it('rejects stale baselines, mutations, incomplete runs and missing reviewers', async () => fixture(async ({ accepted, preliminary, report }) => {
    await expect(acceptReviewedRun(preliminary, accepted, '')).rejects.toThrow('reviewer');
    for (const invalid of [{ ...report, mutation: 'heading-size' }, { ...report, reports: [] }, { ...report, failure: 'capture failed' }, { ...report, acceptedManifestSha256: 'stale' }]) {
      await writeFile(join(preliminary, 'report.json'), JSON.stringify(invalid));
      await expect(acceptReviewedRun(preliminary, accepted, 'Human reviewer')).rejects.toThrow();
    }
  }));
  it('promotes only the validated run and records reviewer and image hashes', async () => fixture(async ({ accepted, preliminary, candidate }) => {
    expect(await acceptReviewedRun(preliminary, accepted, 'Human reviewer')).toBe(1);
    expect(await readFile(join(accepted, 'sample.png'))).toEqual(candidate);
    const { manifest } = await verifyAccepted(accepted);
    expect(manifest.approvals.at(-1).reviewedBy).toBe('Human reviewer');
    expect(manifest.approvals.at(-1).runId).toBe('123');
    expect(manifest.images.sample).toBe(sha256(candidate));
  }));
});
