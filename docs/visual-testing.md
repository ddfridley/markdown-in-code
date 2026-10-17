# Screenshot regression tests and human review

Screenshot tests compare newly generated pixels against human-accepted images. A changed or missing accepted image fails the test. Generating a screenshot never accepts it.

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

Visual mutation checks first require an ordinary comparison to pass against accepted baselines. Pending review blocks these checks, rather than letting existing differences falsely count as mutation detection. Once clean, missing borders, two-pixel offsets and lost heading sizes must each fail through actual pixel comparisons, with all fifteen captures complete. Mutations cannot be accepted and never modify production source.

## Pinned environment and tolerance

The Linux amd64 Docker environment pins the Node image digest, Debian dependency/font snapshot (2025-06-15), Node 22.16.0, VS Code/Electron 1.100.3, Xvfb at 1280×900×24, DejaVu Sans Mono 16px, 24px line height, scale 1, explicit light/dark themes and a 1200×800 viewport (850×800 for narrow cases). Host npm uses `.nvmrc` through NVS. Do not compare ordinary Windows/macOS screenshots against these Linux images.

Only the editor rectangle is captured; measured scrollbar/overview-ruler bounds are excluded. Capture-only CSS hides the cursor and notifications. The suite waits for decoration completion, theme/font paint and three identical captures. It does not approve images based on a sleep.

Pixelmatch uses color threshold 0.1, includes antialiasing changes and allows zero differing pixels above that threshold. Missing images fail without being created as accepted files. Dimension mismatches produce a magenta diff canvas.

The fifteen cases cover frames in light/dark/narrow layouts, selected source, standalone groups, rules, fenced code with sidebar/minimap, and heading hierarchy in light/dark/narrow/tight/wrapped layouts. Wrapped enlarged headings can overflow/clip because Monaco calculates wrap points at base font size; the preview records this known limitation. Extra fonts, zoom, high contrast, horizontal scrolling, complete wrapped frames, tables and more code languages still need coverage. Remote CI execution remains unverified.
