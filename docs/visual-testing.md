# Screenshot regression tests and human review

Final verification after scrollbar approval: 115 unit tests, typecheck and build pass. Fresh Docker run `1792624720646` matches all 31 accepted screenshots. All three visual mutation checks pass by rejecting missing borders, two-pixel offsets and flattened heading sizes through pixel differences; the real wrapped-table horizontal drag passes. This supersedes the earlier scrollbar-only preflight failures.

GitHub run `39691633234`: all platform jobs passed; visual failed only on the same 2,856-pixel horizontal scrollbar in headings-wrapped-light. Capture now makes horizontal scrollbars transparent while preserving layout and hit testing. Local run `1792624455977` matches 28/31, including headings-wrapped-light; tables-long-wrapped-light, tables-long-scrolled-light and fenced-minimap-light change because their accepted screenshots included horizontal scrollbars. Unit/type/build checks pass (115 tests), and the real horizontal table drag still passes. David Fridley explicitly approved run `1792624455977` on October 21, 2026. Its exact screenshot hashes are now accepted and recorded in the manifest, including the three scrollbar-free replacements; future output changes still require separate human review.

Current accepted set: **31 images**, explicitly approved by David Fridley from run `1792624455977` on October 21, 2026. This retains the approved VS Code **1.142.0** environment from migration run `1792623295966` and excludes horizontal scrollbar chrome from screenshots without removing its geometry or mouse interaction. The accepted environment and image hashes are recorded in `tests/visual/baselines/accepted.json`; earlier approvals remain in its history. Docker, capture metadata and version assertions pin the new version. Setup closes the auxiliary sidebar so its default state cannot change the editor width. Wrapped-heading geometry checks require the native viewport path and verify its fallback. The extension's minimum supported VS Code version and platform integration matrix are unchanged.

Post-acceptance verification: typecheck/build, 115 unit tests and the independent heading-contract mutation check pass. Fresh Docker run `1792624144052` matches 30 of 31 accepted images. `headings-wrapped-light` differs by 2,856 pixels at the bottom horizontal scrollbar; its text and centered fence label match. This newer image is not approved or accepted. Visual mutation checks correctly stop at this failing preflight. Review [the new comparison](../tests/visual/preliminary/1792624144052/index.html) if the same issue occurs in GitHub; do not regenerate expectations to make it pass.

For a future environment migration, `npm run test:visual:docker -- --review-environment` generates a marked candidate run without modifying accepted files. It always fails while the environment differs, even if pixels match. Review all images and both environment snapshots before explicitly approving the migration. Ordinary comparison rejects mismatched metadata; ordinary acceptance also rejects a different environment. Environment migration requires deliberate validation of the complete reviewed run, its hashes and every existing accepted case before recording the new metadata and approval.

The link slice's 23 images were approved on October 20, 2026, from run 1792520725803 and committed as cd69445. The current table slice expands coverage to 29 cases. [Run 1792524599284](../tests/visual/preliminary/1792524599284/index.html) contains all 29 images explicitly approved by the user on October 20, 2026. Those exact images are now accepted; future changed/new output still requires separate review.

Screenshot tests compare newly generated pixels against human-accepted images. A changed or missing accepted image fails the test. Generating a screenshot never accepts it.

Capture waits for three consecutive identical screenshots, with an eight-second deadline rather than a fixed attempt count. It advances through browser animation frames and returns immediately when stable; it does not sleep for eight seconds. If motion persists, capture fails and saves the last three raw frames as `CASE.unstable-1.png` through `CASE.unstable-3.png`, plus `CASE.layout.json`, in the preliminary run directory. These diagnostic frames are not accepted images. This addresses the short settling-window failure in GitHub run `39688193868`; it does not change comparisons or fix the legacy renderer's separate overflow-centering limitation.

## Capture and compare

In Git Bash, with Docker running:

```sh
source ./.bashrc
npm run test:visual:docker
```

`npm run visual:capture:docker` is an equivalent capture-and-compare command. Both return a nonzero exit code when any case differs or has no accepted baseline. There is no automatic update command; `--update` is rejected.

Every ordinary run creates a separate directory under `tests/visual/preliminary/<run-id>/` containing:

- `<case>.actual.png`: preliminary output from this run.
- `<case>.expected.png`: the accepted image copied for review, when one exists.
- `<case>.diff.png`: pixel differences for changed cases with an accepted image.
- `index.html`: accepted / preliminary / difference images side by side, with links to full-resolution images. New cases explicitly say that no accepted image exists.
- `report.json`: case results, environment information and SHA-256 hashes identifying this capture and its accepted references.
- `logs/`: VS Code logs for diagnosis.

Open [the latest review page](../tests/visual/preliminary/latest.html), or the exact host path printed at the end of the command. Each numbered run is retained independently, so subsequent tests do not overwrite images already under review. Preliminary files are ignored by Git. CI uploads them with reports and logs for 14 days.

## Accepted images

`tests/visual/baselines/` holds accepted PNGs, environment metadata and `accepted.json`. The manifest records image hashes and review history. Tests verify those hashes, reject unlisted PNGs and mount this directory read-only inside Docker. Editing an accepted PNG or metadata without updating acceptance causes an integrity failure.

The review-gate migration restored the ten user-reviewed images from commit `08c5b70`. More recent generated images were preserved under `tests/visual/preliminary/before-review-gate-.../`. The user subsequently approved every image in run `1792271623561`. Those fifteen exact images are now accepted, with the chat approval recorded in accepted.json. Future changed/new output remains preliminary until separately reviewed.

## Accept a reviewed run

First open that run's `index.html` and inspect every changed/new case. In particular, heading sizes, theme-gray prose, tight-row overlap and wrapped-heading clipping are visible choices or limitations requiring review.

After human review, run this in an interactive Git Bash terminal, replacing the example ID with the reviewed run ID:

```sh
npm run visual:accept -- 1792271623561
```

The command asks for the reviewer name and the exact phrase `ACCEPT <run-id>`. It refuses CI/noninteractive execution. It also refuses incomplete or deliberately mutated runs, changed preliminary images, stale accepted references and mismatched metadata. All candidate hashes are checked before any accepted image is replaced. Reviewer, run ID, time and hashes are recorded in `accepted.json`.

Then rerun:

```sh
npm run test:visual:docker
```

Commit the accepted PNGs and `accepted.json` only after that comparison passes. Acceptance is a separate human action; an implementation request, test failure or request to generate previews is not approval. Repository [AGENTS.md](../AGENTS.md) makes this policy explicit for future agent work. The interactive acknowledgement records review; software cannot decide whether a visual change looks correct.

## Behavior contracts

Parser and interaction tests do not inspect pixels. The independent `tests/contracts/headings.json` fixes the agreed relative heading sizes and weights, including preservation under tight rows. It must not be rewritten simply to accommodate changed implementation. Real VS Code checks separately assert that enabling word wrap retains H1/H2 sizes.

```sh
npm run test:contract:selftest
```

This introduces the former 100% H1/H2 regression in an isolated temporary copy and proves the unchanged contract fails. Production source and the contract are untouched.

```sh
npm run test:visual:selftest:docker
```

Visual mutation checks first require an ordinary comparison to pass against accepted baselines. Pending review blocks these checks, rather than letting existing differences falsely count as mutation detection. Once clean, missing borders, two-pixel offsets and lost heading sizes must each fail through actual pixel comparisons, with all seventeen captures complete. Mutations cannot be accepted and never modify production source.

## Pinned environment and tolerance

The Linux amd64 Docker environment pins the Node image digest, Debian dependency/font snapshot (2025-06-15), Node 22.16.0, VS Code/Electron 1.100.3, Xvfb at 1280×900×24, DejaVu Sans Mono 16px, 24px line height, scale 1, explicit light/dark themes and a 1200×800 viewport (850×800 for narrow cases). Host npm uses `.nvmrc` through NVS. Do not compare ordinary Windows/macOS screenshots against these Linux images.

Only the editor rectangle is captured; measured scrollbar/overview-ruler bounds are excluded. Capture-only CSS hides the cursor and notifications. The suite waits for decoration completion, theme/font paint and three identical captures. It does not approve images based on a sleep.

Pixelmatch uses color threshold 0.1, includes antialiasing changes and allows zero differing pixels above that threshold. Missing images fail without being created as accepted files. Dimension mismatches still fail. Their diff compares the overlapping area at original coordinates: red marks changed pixels, magenta marks edges present in only one image, and matching pixels appear in faint grayscale. Images are never resized or shifted to hide differences.

The seventeen cases cover frames in light/dark/narrow layouts, selected source, standalone groups, rules, fenced code with sidebar/minimap, heading hierarchy in light/dark/narrow/tight/wrapped layouts, and unordered lists in light/dark themes. Wrapped enlarged headings can overflow/clip because Monaco calculates wrap points at base font size; the preview records this known limitation. Extra fonts, zoom, high contrast, horizontal scrolling, complete wrapped frames, tables and more code languages still need coverage. Remote CI execution remains unverified.

The user approved unordered-list run 1792277196123, including two new images and three changed frame images. All seventeen cases are recorded in the acceptance manifest. Review pages show changed/new cases first, followed by unchanged cases, preserving capture order within each group.

The user approved ordered/task-list run `1792430470412`, bringing the accepted suite to nineteen images. New feature output still requires separate review.

The user approved blockquote run `1792441995622`, bringing the accepted suite to twenty-one images. Earlier intermediate blockquote runs are superseded. One intermediate wrapped-heading capture differed in minimap layout; the final capture matched its accepted image without changing that baseline.

Links add two cases, for twenty-three captures in total. Run [1792473091976](../tests/visual/preliminary/1792473091976/index.html) matches all twenty-one accepted cases; only the revised light/dark link images need review. Native underlines can extend into the one-column hit margin; definition destinations remain styled links. The run includes real ordinary/Ctrl mouse checks. Separate Windows tests cover 33 start/middle/end activations, editing release and a three-page actual browser focus/return sequence with explicit navigation presentation. Earlier link previews are superseded. Accepted images and their manifest remain unchanged by the link slice.
